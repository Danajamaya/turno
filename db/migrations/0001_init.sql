-- 0001 initial schema: tenants, team, scheduling, time clock, billing, auth.
-- Target: Postgres 15+ (Supabase or Neon). Access rules: row level security
-- keyed on company_id, enforced for the turno_app role; the app runs user
-- requests as turno_app with app.user_id set (see apps/web/src/lib/db.ts).
-- All times are timestamptz in UTC; each location stores its IANA time zone.
-- Money is integer cents plus a currency code.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- tenants

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  country text not null default 'US',
  currency text not null default 'USD',
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  address text,
  timezone text not null,                       -- IANA, e.g. America/Chicago
  lat double precision,
  lng double precision,
  geofence_radius_m integer not null default 150 check (geofence_radius_m between 25 and 5000),
  pay_period text not null default 'weekly'
    check (pay_period in ('weekly','biweekly','semimonthly')),
  pay_period_anchor date not null default current_date,
  week_start_day smallint not null default 1 check (week_start_day between 0 and 6),
  early_clock_in_min integer not null default 10 check (early_clock_in_min >= 0),
  ot_daily_min integer,                         -- null = no daily overtime (federal)
  ot_weekly_min integer not null default 2400,  -- 40 h
  break_rules jsonb not null default '[]',
  labor_target_pct numeric(5,2),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on locations (company_id);

-- People who can sign in. Sign-in is passwordless: a one-time link by email
-- or a code by SMS (auth_tokens), then an opaque session cookie (sessions).
create table users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  full_name text not null default '',
  locale text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reachable check (email is not null or phone is not null)
);
create unique index users_email_key on users (lower(email)) where email is not null;
create unique index users_phone_key on users (phone) where phone is not null;

create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,                -- sha256 of the link token or code
  channel text not null check (channel in ('email','sms')),
  expires_at timestamptz not null,
  used_at timestamptz,
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);
create index on auth_tokens (user_id, created_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,                -- sha256 of the cookie value
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on sessions (user_id);

-- A person inside a company. user_id is null until the invite is accepted,
-- so managers can schedule people who have not signed up yet.
create table members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role text not null default 'employee' check (role in ('owner','manager','employee')),
  pin_hash text,                                -- scrypt of the 4-6 digit kiosk PIN
  job_title text,                               -- v1: one job and wage per person;
  wage_cents integer not null default 0 check (wage_cents >= 0), -- member_job_roles comes later
  colour smallint not null default 1 check (colour between 1 and 8),
  status text not null default 'invited' check (status in ('invited','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id),
  -- archived people may have had their contact details erased (account deletion)
  constraint reachable check (status = 'archived' or email is not null or phone is not null)
);
create index on members (company_id, status);
create index on members (user_id);

create table location_members (
  location_id uuid not null references locations(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  primary key (location_id, member_id)
);
create index on location_members (member_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on invites (member_id);

create table job_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  colour text not null default '#64748b',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, name)
);
create index on job_roles (company_id);

create table member_job_roles (
  member_id uuid not null references members(id) on delete cascade,
  job_role_id uuid not null references job_roles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  wage_cents integer not null default 0 check (wage_cents >= 0),
  wage_type text not null default 'hourly' check (wage_type in ('hourly','salary')),
  is_primary boolean not null default false,
  primary key (member_id, job_role_id)
);
create index on member_job_roles (job_role_id);

-- ---------------------------------------------------------------- scheduling

create table schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  week_start date not null,                     -- local date in the location's zone
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  published_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, week_start)
);
create index on schedule_weeks (company_id);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  schedule_week_id uuid not null references schedule_weeks(id) on delete cascade,
  member_id uuid references members(id) on delete set null,   -- null = open shift
  job_role_id uuid references job_roles(id) on delete set null,
  job_title text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  unpaid_break_min integer not null default 0 check (unpaid_break_min >= 0),
  note text,
  published_version integer not null default 0,  -- bumps on each publish that touched it
  dirty boolean not null default true,           -- changed since last publish
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_positive check (end_at > start_at),
  constraint shift_max_24h check (end_at - start_at <= interval '24 hours'),
  -- one person cannot hold two overlapping shifts
  constraint no_double_booking exclude using gist (
    member_id with =, tstzrange(start_at, end_at) with &&
  ) where (member_id is not null)
);
create index on shifts (location_id, start_at);
create index on shifts (member_id, start_at);
create index on shifts (schedule_week_id);
create index on shifts (company_id);
create index on shifts (job_role_id);

create table shift_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  shifts jsonb not null default '[]',  -- [{weekday, start_time, end_time, job_role_id, member_id?}]
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on shift_templates (location_id);
create index on shift_templates (company_id);

create table availabilities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time,                              -- null with all_day
  end_time time,
  all_day boolean not null default false,
  kind text not null check (kind in ('available','unavailable')),
  status text not null default 'approved' check (status in ('pending','approved','denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avail_times check (all_day or (start_time is not null and end_time is not null))
);
create index on availabilities (member_id, weekday);
create index on availabilities (company_id, status);

create table time_off_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default true,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tor_positive check (end_at > start_at)
);
create index on time_off_requests (member_id, start_at);
create index on time_off_requests (company_id, status);

create table shift_trades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  from_member_id uuid not null references members(id) on delete cascade,
  to_member_id uuid references members(id) on delete cascade,  -- null = anyone may cover
  status text not null default 'offered'
    check (status in ('offered','accepted','approved','denied','cancelled')),
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on shift_trades (shift_id);
create index on shift_trades (from_member_id);
create index on shift_trades (to_member_id);
create index on shift_trades (company_id, status);
-- only one live trade per shift
create unique index shift_trades_one_open on shift_trades (shift_id)
  where status in ('offered','accepted');

-- ---------------------------------------------------------------- time clock

create table kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  token_hash text not null unique,              -- device credential, revocable
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on kiosk_devices (location_id);
create index on kiosk_devices (company_id);

create table time_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null,
  job_role_id uuid references job_roles(id) on delete set null,
  wage_cents integer not null default 0,        -- snapshot at clock-in
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  source text not null check (source in ('kiosk','mobile','web','manual')),
  kiosk_device_id uuid references kiosk_devices(id) on delete set null,
  client_punch_id uuid unique,                  -- idempotency for offline punch replay
  clock_in_lat double precision,
  clock_in_lng double precision,
  inside_geofence boolean,
  clock_in_photo_path text,                     -- Supabase Storage key, private bucket
  clock_out_photo_path text,
  approved_by uuid references members(id) on delete set null,
  approved_at timestamptz,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_positive check (clock_out_at is null or clock_out_at > clock_in_at)
);
create index on time_cards (member_id, clock_in_at);
create index on time_cards (location_id, clock_in_at);
create index on time_cards (company_id);
create index on time_cards (shift_id);
create index on time_cards (job_role_id);
create index on time_cards (kiosk_device_id);
-- a person can be clocked in only once at a time
create unique index time_cards_one_open on time_cards (member_id) where clock_out_at is null;

create table breaks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  time_card_id uuid not null references time_cards(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  paid boolean not null default false,
  client_punch_id uuid unique,
  created_at timestamptz not null default now(),
  constraint break_positive check (end_at is null or end_at > start_at)
);
create index on breaks (time_card_id);
create index on breaks (company_id);
create unique index breaks_one_open on breaks (time_card_id) where end_at is null;

create table time_card_edits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  time_card_id uuid not null references time_cards(id) on delete cascade,
  editor_id uuid references members(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  reason text,
  created_at timestamptz not null default now()
);
create index on time_card_edits (time_card_id);
create index on time_card_edits (company_id);

-- ---------------------------------------------------------------- messaging & billing

create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  kind text not null,                           -- schedule_published, request_decided, late_alert, ...
  payload jsonb not null default '{}',
  channels text[] not null default '{push}',
  sent_at timestamptz,
  read_at timestamptz,
  dedupe_key text unique,                       -- jobs may run twice
  created_at timestamptz not null default now()
);
create index on notifications (member_id, created_at desc);
create index on notifications (company_id);

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('ios','android','web')),
  created_at timestamptz not null default now()
);
create index on push_tokens (user_id);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies(id) on delete cascade,
  stripe_subscription_id text unique,
  plan text not null default 'free' check (plan in ('free','essentials','plus')),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','incomplete')),
  location_quantity integer not null default 1 check (location_quantity >= 1),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stripe_events (
  id text primary key,                          -- Stripe event id: webhook idempotency
  type text not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- access rules

-- The signed-in user for this transaction, set by the app with
-- set_config('app.user_id', ..., true). Null outside a user request.
create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'turno_app') then
    create role turno_app nologin;
  end if;
end $$;

-- Companies and role of the signed-in user. security definer so policies on
-- members do not recurse into themselves.
create or replace function auth_member_role(cid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from members
  where company_id = cid and user_id = app_user_id() and status = 'active'
$$;

create or replace function auth_member_id(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from members
  where company_id = cid and user_id = app_user_id() and status = 'active'
$$;

create or replace function auth_is_manager(cid uuid) returns boolean
language sql stable as $$
  select coalesce(auth_member_role(cid) in ('owner','manager'), false)
$$;

-- Tables any member of the company may read; only managers may write.
do $$
declare t text;
begin
  foreach t in array array['locations','location_members','job_roles','member_job_roles',
                           'schedule_weeks','shift_templates','kiosk_devices']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (auth_member_role(company_id) is not null)$p$,
                   t || '_read', t);
    execute format($p$create policy %I on %I for all using (auth_is_manager(company_id))
                      with check (auth_is_manager(company_id))$p$, t || '_manage', t);
  end loop;
end $$;

alter table companies enable row level security;
create policy companies_read on companies for select using (auth_member_role(id) is not null);
create policy companies_owner on companies for update using (auth_member_role(id) = 'owner');

alter table users enable row level security;
create policy users_self on users for all using (id = app_user_id()) with check (id = app_user_id());
create policy users_teammates on users for select using (
  exists (select 1 from members m where m.user_id = users.id and auth_member_role(m.company_id) is not null)
);
alter table auth_tokens enable row level security;  -- system only
alter table sessions enable row level security;     -- system only

alter table members enable row level security;
create policy members_read on members for select using (auth_member_role(company_id) is not null);
create policy members_manage on members for all using (auth_is_manager(company_id))
  with check (auth_is_manager(company_id));

-- Shifts: employees see published shifts and their own drafts never; managers everything.
alter table shifts enable row level security;
create policy shifts_read on shifts for select using (
  auth_is_manager(company_id)
  or (auth_member_role(company_id) is not null and published_version > 0)
);
create policy shifts_manage on shifts for all using (auth_is_manager(company_id))
  with check (auth_is_manager(company_id));

-- Own-row tables: employees read and create their own, managers everything.
do $$
declare t text;
begin
  foreach t in array array['availabilities','time_off_requests','time_cards','notifications']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (
                      auth_is_manager(company_id) or member_id = auth_member_id(company_id))$p$,
                   t || '_read', t);
    execute format($p$create policy %I on %I for all using (auth_is_manager(company_id))
                      with check (auth_is_manager(company_id))$p$, t || '_manage', t);
  end loop;
end $$;
-- Employees file their own availability and time-off; clock punches go
-- through server routes (service role) so geofence and early-clock-in rules
-- cannot be skipped from the client.
create policy availabilities_own_insert on availabilities for insert
  with check (member_id = auth_member_id(company_id) and status = 'pending');
create policy time_off_own_insert on time_off_requests for insert
  with check (member_id = auth_member_id(company_id) and status = 'pending');
create policy notifications_own_read_mark on notifications for update
  using (member_id = auth_member_id(company_id));

alter table shift_trades enable row level security;
create policy shift_trades_read on shift_trades for select using (
  auth_is_manager(company_id)
  or from_member_id = auth_member_id(company_id)
  or to_member_id = auth_member_id(company_id)
  or (to_member_id is null and auth_member_role(company_id) is not null)
);
create policy shift_trades_manage on shift_trades for all using (auth_is_manager(company_id))
  with check (auth_is_manager(company_id));

alter table breaks enable row level security;
create policy breaks_read on breaks for select using (
  auth_is_manager(company_id)
  or exists (select 1 from time_cards c where c.id = time_card_id
             and c.member_id = auth_member_id(c.company_id))
);
create policy breaks_manage on breaks for all using (auth_is_manager(company_id))
  with check (auth_is_manager(company_id));

alter table time_card_edits enable row level security;
create policy time_card_edits_read on time_card_edits for select using (auth_is_manager(company_id));

alter table invites enable row level security;
create policy invites_manage on invites for all using (auth_is_manager(company_id))
  with check (auth_is_manager(company_id));

alter table push_tokens enable row level security;
create policy push_tokens_self on push_tokens for all using (user_id = app_user_id())
  with check (user_id = app_user_id());

alter table subscriptions enable row level security;
create policy subscriptions_read on subscriptions for select using (auth_is_manager(company_id));
-- writes only from the Stripe webhook (service role)

alter table stripe_events enable row level security;  -- service role only

-- ---------------------------------------------------------------- updated_at

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- grants

grant usage on schema public to turno_app;
grant select, insert, update, delete on all tables in schema public to turno_app;
grant execute on all functions in schema public to turno_app;
