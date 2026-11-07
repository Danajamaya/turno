-- 0008 seasons, combos, review photos, WhatsApp, loyalty, training,
-- insurance, multi-city and the sustainable seal.

-- 1. Seasonal prices: a percentage up or down between two dates, for one tour or all of them.
create table price_seasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tour_id uuid references tours(id) on delete cascade,     -- null: every tour
  name text not null,
  starts_on date not null,
  ends_on date not null,
  percent integer not null check (percent between -90 and 300 and percent <> 0),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on price_seasons (company_id, starts_on);
alter table bookings add column if not exists season_percent integer not null default 0;

-- 2. Combos: what a tour includes beyond the walk (tickets, tapas, transport).
alter table tours add column if not exists includes text[] not null default '{}';

-- 3. Review photos are public media of kind 'review'.
alter table media drop constraint if exists media_owner_kind_check;
alter table media add constraint media_owner_kind_check check (owner_kind in ('profile','tour','verification','review'));

-- 4. WhatsApp Business: the number connected and incoming messages tied to a traveller's thread.
alter table companies add column if not exists whatsapp_phone_id text unique;
alter table companies add column if not exists whatsapp_auto_reply boolean not null default true;
alter table inquiries add column if not exists channel text not null default 'email' check (channel in ('email','whatsapp'));
alter table inquiries add column if not exists phone text;

-- 5. Loyalty: returning travellers get a percentage off on Turno.
alter table companies add column if not exists loyalty_percent integer not null default 0 check (loyalty_percent between 0 and 50);
alter table bookings add column if not exists loyalty_cents integer not null default 0 check (loyalty_cents >= 0);

-- 6. Training: a script per tour, and who is trained to lead it.
alter table tours add column if not exists script text check (script is null or length(script) <= 20000);
alter table tours add column if not exists requires_training boolean not null default false;
create table tour_training (
  tour_id uuid not null references tours(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  trained_at timestamptz not null default now(),
  primary key (tour_id, member_id)
);

-- 7. Insurance as an optional add-on per person.
alter table tours add column if not exists insurance_cents integer not null default 0 check (insurance_cents between 0 and 5000);
alter table bookings add column if not exists insurance_cents integer not null default 0 check (insurance_cents >= 0);

-- 10. Sustainable tourism: what the business commits to.
alter table guide_profiles add column if not exists sustainable_local boolean not null default false;
alter table guide_profiles add column if not exists sustainable_no_plastic boolean not null default false;
alter table guide_profiles add column if not exists sustainable_public_transport boolean not null default false;

alter table price_seasons enable row level security;
create policy price_seasons_manage on price_seasons for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table tour_training enable row level security;
create policy tour_training_manage on tour_training for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
create policy tour_training_self on tour_training for select using (member_id = auth_member_id(company_id));
grant select, insert, update, delete on price_seasons, tour_training to turno_app;
