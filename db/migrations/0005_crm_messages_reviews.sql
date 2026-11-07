-- 0005 travellers CRM: message queue (reminders, review requests) and
-- verified reviews (only from a real booking, through its own link).

create table message_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  traveller_id uuid references travellers(id) on delete set null,
  kind text not null check (kind in ('reminder','review')),
  language text not null default 'es' check (language in ('es','en')),
  body text not null,
  status text not null default 'pending' check (status in ('pending','sent','skipped')),
  sent_via text check (sent_via in ('email','whatsapp')),
  due_on date not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, kind)
);
create index on message_queue (company_id, status, due_on);
create index on message_queue (traveller_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  booking_id uuid not null unique references bookings(id) on delete cascade,
  token_hash text not null unique,              -- the link sent to the traveller
  rating smallint check (rating between 1 and 5),
  body text,
  author_name text,
  reply text,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on reviews (company_id, submitted_at desc);

alter table message_queue enable row level security;
create policy message_queue_manage on message_queue for all using (auth_is_manager(company_id)) with check (auth_is_manager(company_id));
alter table reviews enable row level security;
create policy reviews_read on reviews for select using (auth_member_role(company_id) is not null);
create policy reviews_reply on reviews for update using (auth_is_manager(company_id));

grant select, insert, update, delete on message_queue, reviews to turno_app;

-- Accent- and case-insensitive city search ("Malaga" finds "Málaga") without the unaccent extension.
create or replace function unaccent_lower(t text) returns text language sql immutable as $$
  select translate(lower(t), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc')
$$;
grant execute on function unaccent_lower(text) to turno_app;
