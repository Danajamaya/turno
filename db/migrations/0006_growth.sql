-- 0006 growth features: waitlist, closing departures, QR tips, photos,
-- traveller questions, gift cards, guide pay rules, weekly summary, web push.

-- 1. A traveller waits for a full departure; the first in line is emailed when places free up.
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tour_id uuid not null references tours(id) on delete cascade,
  starts_at timestamptz not null,
  name text not null,
  email text not null,
  people integer not null check (people between 1 and 50),
  language text not null default 'es' check (language in ('es','en')),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tour_id, starts_at, email)
);
create index on waitlist (company_id, tour_id, starts_at, created_at);

-- 2. Departures the business stopped selling on Turno (e.g. after an overbooking elsewhere).
create table departure_closures (
  company_id uuid not null references companies(id) on delete cascade,
  tour_id uuid not null references tours(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (tour_id, starts_at)
);

-- 3. Tips left by card at the end of a tour, through a QR the guide shows.
create table tips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tour_name text not null,
  starts_at timestamptz not null,
  guide_member_id uuid references members(id) on delete set null,
  amount_cents integer not null check (amount_cents between 100 and 100000),
  currency text not null default 'EUR',
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on tips (company_id, starts_at);

-- 4. Photos for the public profile and the tours (kept in the database; small, resized by the browser).
create table media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('profile','tour')),
  owner_id uuid not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  bytes bytea not null check (octet_length(bytes) <= 2000000),
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index on media (owner_kind, owner_id, sort);

-- 5. A traveller writes to the guide before booking; replies go by email with a private link.
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  traveller_id uuid references travellers(id) on delete set null,
  name text not null,
  email text not null,
  language text not null default 'es' check (language in ('es','en')),
  token_hash text not null unique,
  status text not null default 'open' check (status in ('open','answered','closed')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on inquiries (company_id, status, last_message_at desc);
create table inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references inquiries(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  from_traveller boolean not null,
  member_id uuid references members(id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on inquiry_messages (inquiry_id, created_at);

-- 6. Gift cards: an amount the recipient spends on any tour of the business.
create table gift_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null unique,
  amount_cents integer not null check (amount_cents between 500 and 100000),
  balance_cents integer not null check (balance_cents >= 0),
  currency text not null default 'EUR',
  buyer_name text not null,
  buyer_email text not null,
  recipient_name text not null,
  recipient_email text,
  message text,
  status text not null default 'pending' check (status in ('pending','active','used','void')),
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on gift_cards (company_id, created_at desc);
alter table bookings add column if not exists gift_card_id uuid references gift_cards(id) on delete set null;
alter table bookings add column if not exists gift_cents integer not null default 0 check (gift_cents >= 0);

-- 8. How each guide is paid: per tour, per person, and a share of the tips.
create table member_pay_rules (
  member_id uuid primary key references members(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  per_tour_cents integer not null default 0 check (per_tour_cents >= 0),
  per_person_cents integer not null default 0 check (per_person_cents >= 0),
  tip_share_bps integer not null default 10000 check (tip_share_bps between 0 and 10000),
  languages text[] not null default '{}'
);

-- 9. Weekly summary: on by default, managers can switch it off.
alter table companies add column if not exists weekly_summary boolean not null default true;
alter table companies add column if not exists weekly_summary_sent_at timestamptz;

-- 10. Browser push subscriptions per person.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index on push_subscriptions (company_id, member_id);

alter table waitlist enable row level security;
create policy waitlist_manage on waitlist for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table departure_closures enable row level security;
create policy departure_closures_manage on departure_closures for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table tips enable row level security;
create policy tips_read on tips for select using (auth_is_manager(company_id) or guide_member_id = auth_member_id(company_id));
alter table media enable row level security;
create policy media_manage on media for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table inquiries enable row level security;
create policy inquiries_manage on inquiries for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table inquiry_messages enable row level security;
create policy inquiry_messages_manage on inquiry_messages for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table gift_cards enable row level security;
create policy gift_cards_manage on gift_cards for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table member_pay_rules enable row level security;
create policy member_pay_rules_manage on member_pay_rules for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
create policy member_pay_rules_self on member_pay_rules for select using (member_id = auth_member_id(company_id));
alter table push_subscriptions enable row level security;
create policy push_subscriptions_self on push_subscriptions for all using (member_id = auth_member_id(company_id)) with check (member_id = auth_member_id(company_id));

grant select, insert, update, delete on waitlist, departure_closures, tips, media, inquiries, inquiry_messages, gift_cards, member_pay_rules, push_subscriptions to turno_app;
