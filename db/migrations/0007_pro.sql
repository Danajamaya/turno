-- 0007 money, sales, operations, platforms and trust.

-- Money: direct payouts (Stripe Connect), deposits, no-show fee, fiscal data, referrals.
alter table companies add column if not exists stripe_account_id text unique;
alter table companies add column if not exists stripe_account_ready boolean not null default false;
alter table companies add column if not exists legal_name text;
alter table companies add column if not exists tax_id text;
alter table companies add column if not exists fiscal_address text;
alter table companies add column if not exists google_review_url text check (google_review_url is null or google_review_url ~ '^https://');
alter table companies add column if not exists referral_code text unique;
alter table companies add column if not exists referred_by uuid references companies(id) on delete set null;
alter table companies add column if not exists reduced_commission_until timestamptz;
alter table companies add column if not exists verified_at timestamptz;
alter table companies add column if not exists verification_status text not null default 'none'
  check (verification_status in ('none','pending','verified','rejected'));
update companies set referral_code = upper(substr(md5(id::text), 1, 8)) where referral_code is null;
alter table companies alter column referral_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));

alter table tours add column if not exists deposit_cents integer not null default 0 check (deposit_cents >= 0);
alter table tours add column if not exists no_show_fee_cents integer not null default 0 check (no_show_fee_cents between 0 and 5000);
alter table tours add column if not exists stops jsonb not null default '[]';          -- [{"name":"Plaza Mayor","lat":40.41,"lng":-3.70}]
alter table tours add column if not exists equipment text[] not null default '{}';

alter table bookings add column if not exists deposit_cents integer not null default 0 check (deposit_cents >= 0);
alter table bookings add column if not exists deposit_paid_at timestamptz;
alter table bookings add column if not exists stripe_session_id text unique;
alter table bookings add column if not exists stripe_customer_id text;
alter table bookings add column if not exists stripe_payment_method_id text;
alter table bookings add column if not exists no_show_fee_cents integer not null default 0 check (no_show_fee_cents >= 0);
alter table bookings add column if not exists no_show_charged_at timestamptz;
alter table bookings add column if not exists notes text check (notes is null or length(notes) <= 500);
alter table bookings add column if not exists children integer not null default 0 check (children between 0 and 100);
alter table bookings add column if not exists discount_code_id uuid;
alter table bookings add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);

-- Sales: discount codes (also for hotel partners, who earn a commission).
create table discount_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  percent integer check (percent between 1 and 100),
  amount_cents integer check (amount_cents > 0),
  partner_name text,
  partner_commission_bps integer not null default 0 check (partner_commission_bps between 0 and 5000),
  max_uses integer check (max_uses > 0),
  uses integer not null default 0,
  expires_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code),
  constraint one_kind check ((percent is null) <> (amount_cents is null))
);
alter table bookings add constraint bookings_discount_fk foreign key (discount_code_id) references discount_codes(id) on delete set null;

-- Group and school quotes ride on the traveller questions.
alter table inquiries add column if not exists kind text not null default 'question' check (kind in ('question','quote'));
alter table inquiries add column if not exists details jsonb;

-- Operations: where the group is now, swaps between guides, equipment checked per tour.
create table live_locations (
  company_id uuid not null references companies(id) on delete cascade,
  starts_at timestamptz not null,
  tour_name text not null,
  member_id uuid references members(id) on delete set null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  updated_at timestamptz not null default now(),
  primary key (company_id, starts_at, tour_name)
);
create table tour_swaps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  starts_at timestamptz not null,
  tour_name text not null,
  from_member_id uuid not null references members(id) on delete cascade,
  to_member_id uuid references members(id) on delete set null,
  note text,
  status text not null default 'open' check (status in ('open','taken','cancelled')),
  created_at timestamptz not null default now(),
  taken_at timestamptz
);
create index on tour_swaps (company_id, status, starts_at);
create table equipment_checks (
  company_id uuid not null references companies(id) on delete cascade,
  starts_at timestamptz not null,
  tour_name text not null,
  item text not null,
  checked_by uuid references members(id) on delete set null,
  checked_at timestamptz not null default now(),
  primary key (company_id, starts_at, tour_name, item)
);

-- Platforms: keys for resellers that connect through the OCTO API (GetYourGuide, Viator, …).
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  platform text not null,
  label text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table octo_holds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  api_key_id uuid not null references api_keys(id) on delete cascade,
  tour_id uuid not null references tours(id) on delete cascade,
  starts_at timestamptz not null,
  people integer not null check (people between 1 and 500),
  status text not null default 'ON_HOLD' check (status in ('ON_HOLD','CONFIRMED','CANCELLED','EXPIRED')),
  booking_id uuid references bookings(id) on delete set null,
  reseller_reference text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on octo_holds (tour_id, starts_at, status);

-- Trust: verification documents are private media (never served publicly).
alter table media drop constraint if exists media_owner_kind_check;
alter table media add constraint media_owner_kind_check check (owner_kind in ('profile','tour','verification'));

alter table discount_codes enable row level security;
create policy discount_codes_manage on discount_codes for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table live_locations enable row level security;
create policy live_locations_member on live_locations for all using (auth_member_role(company_id) is not null) with check (auth_member_role(company_id) is not null);
alter table tour_swaps enable row level security;
create policy tour_swaps_member on tour_swaps for select using (auth_member_role(company_id) is not null);
alter table equipment_checks enable row level security;
create policy equipment_checks_member on equipment_checks for all using (auth_member_role(company_id) is not null) with check (auth_member_role(company_id) is not null);
alter table api_keys enable row level security;
create policy api_keys_manage on api_keys for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table octo_holds enable row level security;
create policy octo_holds_manage on octo_holds for select using (auth_is_manager(company_id));

grant select, insert, update, delete on discount_codes, live_locations, tour_swaps, equipment_checks, api_keys, octo_holds to turno_app;
