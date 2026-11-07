-- 0004 guide app, calendar feeds, public profiles and marketplace bookings.

-- Private calendar subscription URLs (Google, Apple, Outlook read an .ics).
-- Only the hash of the token is stored; regenerating revokes the old URL.
create table calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  member_id uuid not null unique references members(id) on delete cascade,
  token_hash text not null unique,
  last_fetched_at timestamptz,
  created_at timestamptz not null default now()
);
create index on calendar_feeds (company_id);

-- The business's public page in the marketplace (one per company).
create table guide_profiles (
  company_id uuid primary key references companies(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  headline text not null default '',
  bio text not null default '',
  city text not null default '',
  languages text[] not null default '{}',
  specialities text[] not null default '{}',
  video_url text,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Tours sold on Turno: per-person or per-group packages, or free (tip) tours.
alter table tours add column if not exists max_people_per_booking integer not null default 10 check (max_people_per_booking between 1 and 500);
alter table tours add column if not exists sort integer not null default 0;
-- Weekly departures, local to the company's first location: [{"weekday":1,"time":"10:30"}] (0 = Sunday).
alter table tours add column if not exists weekly_slots jsonb not null default '[]';

-- The Agencia (plus) plan has its own, lower commission than Pro.
alter table platform_settings add column if not exists commission_bps_plus integer not null default 500 check (commission_bps_plus between 0 and 5000);

-- Marketplace bookings: the traveller's contact and how payment happens.
alter table bookings add column if not exists payment text not null default 'external'
  check (payment in ('external','on_site','online','free'));
alter table bookings add column if not exists checked_in_at timestamptz;

alter table calendar_feeds enable row level security;
create policy calendar_feeds_self on calendar_feeds for select using (member_id = auth_member_id(company_id));

alter table guide_profiles enable row level security;
create policy guide_profiles_read on guide_profiles for select using (auth_member_role(company_id) is not null);
create policy guide_profiles_manage on guide_profiles for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));

grant select, insert, update, delete on calendar_feeds, guide_profiles to turno_app;
create trigger guide_profiles_touch before update on guide_profiles for each row execute function touch_updated_at();
