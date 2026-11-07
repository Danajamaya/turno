-- 0002 guides: tours, bookings from every channel, travellers, inbound
-- booking emails, money (guide income and platform earnings).
-- Money: integer cents + currency. Times: timestamptz (UTC).

-- ---------------------------------------------------------------- platform

-- People who run Turno itself and can see platform earnings.
create table platform_admins (
  user_id uuid primary key references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Commission per plan on bookings sold through Turno (basis points: 1500 = 15%).
-- Placeholder rates until the owner sets them.
create table platform_settings (
  id boolean primary key default true check (id),
  commission_bps_free integer not null default 1800 check (commission_bps_free between 0 and 5000),
  commission_bps_paid integer not null default 700 check (commission_bps_paid between 0 and 5000),
  updated_at timestamptz not null default now()
);
insert into platform_settings default values;

-- Every euro Turno earns: commissions on its own bookings, and subscription
-- invoices (written by the Stripe webhook). Append-only.
create table platform_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  kind text not null check (kind in ('commission','subscription','refund')),
  amount_cents integer not null,
  currency text not null default 'EUR',
  booking_id uuid,
  stripe_ref text unique,
  occurred_at timestamptz not null default now()
);
create index on platform_ledger (occurred_at);
create index on platform_ledger (company_id);

-- ---------------------------------------------------------------- tours

create table tours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  guide_member_id uuid references members(id) on delete set null,
  title text not null,
  description text,
  meeting_point text,
  duration_min integer not null default 120 check (duration_min between 15 and 1440),
  capacity integer not null default 20 check (capacity between 1 and 500),
  price_model text not null default 'free_tip' check (price_model in ('free_tip','per_person','per_group')),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'EUR',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tours (company_id);

-- ---------------------------------------------------------------- channels

-- Where bookings come from. One row per platform the guide connects, plus
-- 'turno' for the marketplace. fee_per_person_cents: what that platform
-- charges the guide per attendee (free-tour platforms), for net income.
create table channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  platform text not null check (platform in ('turno','guruwalk','freetour','strawberry','getyourguide','viator','civitatis','other')),
  method text not null check (method in ('marketplace','forward','gmail','api','ical','manual')),
  status text not null default 'active' check (status in ('active','error','disconnected')),
  fee_per_person_cents integer not null default 0 check (fee_per_person_cents >= 0),
  last_event_at timestamptz,
  settings jsonb not null default '{}',
  secret_enc text,                               -- encrypted OAuth refresh token or API key
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, platform, method)
);
create index on channels (company_id);

-- The forwarding address r-<token>@<inbound domain>: one per company.
create table inbound_addresses (
  token text primary key,
  company_id uuid not null unique references companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table inbound_emails (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  message_id text not null,
  from_address text not null,
  subject text not null default '',
  body_text text,                                -- erased after 30 days (cleanup job)
  received_at timestamptz not null default now(),
  platform text not null,
  reader text,
  confidence numeric(3,2),
  extracted jsonb,
  status text not null check (status in ('imported','needs_review','ignored','failed')),
  booking_id uuid,
  unique (company_id, message_id)
);
create index on inbound_emails (company_id, status, received_at desc);

-- ---------------------------------------------------------------- travellers & bookings

create table travellers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null default '',
  email text,
  phone text,
  language text,
  first_platform text,
  consent_marketing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on travellers (company_id);
create unique index travellers_email_key on travellers (company_id, lower(email)) where email is not null;
create unique index travellers_phone_key on travellers (company_id, phone) where phone is not null and email is null;

create table bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  platform text not null,
  external_ref text not null,                    -- the platform's booking code; Turno's own for marketplace sales
  tour_id uuid references tours(id) on delete set null,
  tour_name text,                                -- as the platform wrote it, until matched to a tour
  guide_member_id uuid references members(id) on delete set null,
  traveller_id uuid references travellers(id) on delete set null,
  starts_at timestamptz not null,
  people integer not null check (people between 1 and 500),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','attended','no_show')),
  -- money, all optional for free tours
  gross_cents integer not null default 0 check (gross_cents >= 0),        -- what the traveller paid
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0), -- what the selling platform keeps
  tips_cents integer not null default 0 check (tips_cents >= 0),          -- declared by the guide after the tour
  currency text not null default 'EUR',
  turno_commission_cents integer not null default 0 check (turno_commission_cents >= 0), -- only when sold on Turno
  source_email_id uuid references inbound_emails(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, platform, external_ref)
);
create index on bookings (company_id, starts_at);
create index on bookings (guide_member_id, starts_at);
create index on bookings (traveller_id);
create index on bookings (tour_id);

-- A cancellation that arrived before its booking: applied when the booking does.
create table pending_cancellations (
  company_id uuid not null references companies(id) on delete cascade,
  platform text not null,
  external_ref text not null,
  received_at timestamptz not null default now(),
  primary key (company_id, platform, external_ref)
);

-- ---------------------------------------------------------------- access rules

alter table platform_admins enable row level security;
create policy platform_admins_self on platform_admins for select using (user_id = app_user_id());
alter table platform_settings enable row level security;
create policy platform_settings_read on platform_settings for select using (app_user_id() is not null);
alter table platform_ledger enable row level security;  -- read through system() after an admin check
alter table inbound_addresses enable row level security;
create policy inbound_addresses_read on inbound_addresses for select using (auth_is_manager(company_id));
alter table pending_cancellations enable row level security;  -- system only

do $$
declare t text;
begin
  foreach t in array array['tours','channels','travellers']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %I on %I for select using (auth_member_role(company_id) is not null)$p$, t || '_read', t);
    execute format($p$create policy %I on %I for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id))$p$, t || '_manage', t);
  end loop;
end $$;

-- Bookings: managers see all; a guide sees the ones assigned to them.
alter table bookings enable row level security;
create policy bookings_read on bookings for select using (
  auth_is_manager(company_id) or guide_member_id = auth_member_id(company_id)
);
create policy bookings_manage on bookings for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));

alter table inbound_emails enable row level security;
create policy inbound_emails_manage on inbound_emails for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));

grant select, insert, update, delete on all tables in schema public to turno_app;

do $$
declare t text;
begin
  foreach t in array array['tours','channels','travellers','bookings']
  loop
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
