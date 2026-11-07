-- 0003 team chat ("Equipo"): channels for the whole team, direct messages
-- between two people, messages that can carry a tour card.

create table chat_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  kind text not null check (kind in ('channel','direct')),
  name text,                                     -- null for direct messages
  topic text,
  created_by uuid references members(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint channel_named check (kind = 'direct' or name is not null),
  unique (company_id, name)
);
create index on chat_channels (company_id);

-- Who belongs to a direct message, and everyone's read position in any channel.
create table chat_members (
  channel_id uuid not null references chat_channels(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  in_direct boolean not null default false,      -- true: one of the two people of a direct message
  last_read_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);
create index on chat_members (member_id);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  channel_id uuid not null references chat_channels(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  attachment jsonb,                              -- e.g. {"type":"tour","startsAt":..,"tourName":..,"people":..,"platforms":[..]}
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on chat_messages (channel_id, created_at);
create index on chat_messages (company_id);

-- Can the signed-in person see this channel? Team channels: anyone active in
-- the company. Direct messages: only its two people.
create or replace function chat_can_see(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from chat_channels ch
    where ch.id = cid and auth_member_role(ch.company_id) is not null and (
      ch.kind = 'channel'
      or exists (select 1 from chat_members cm where cm.channel_id = ch.id and cm.in_direct and cm.member_id = auth_member_id(ch.company_id))
    )
  )
$$;

alter table chat_channels enable row level security;
-- Team channels are checked inline: chat_can_see() reads the table through a
-- stable snapshot, which cannot see a row being inserted (INSERT .. RETURNING).
create policy chat_channels_read on chat_channels for select using (
  (kind = 'channel' and auth_member_role(company_id) is not null) or chat_can_see(id)
);
create policy chat_channels_create on chat_channels for insert with check (
  auth_member_role(company_id) is not null and (kind = 'direct' or auth_is_manager(company_id))
);
create policy chat_channels_manage on chat_channels for update using (auth_is_manager(company_id) and kind = 'channel');

alter table chat_members enable row level security;
create policy chat_members_read on chat_members for select using (chat_can_see(channel_id));
create policy chat_members_self on chat_members for all
  using (member_id = auth_member_id(company_id))
  with check (member_id = auth_member_id(company_id) and chat_can_see(channel_id));

alter table chat_messages enable row level security;
create policy chat_messages_read on chat_messages for select using (chat_can_see(channel_id));
-- you can only post as yourself, in a channel you can see
create policy chat_messages_post on chat_messages for insert with check (
  member_id = auth_member_id(company_id) and chat_can_see(channel_id)
);
create policy chat_messages_own on chat_messages for update using (member_id = auth_member_id(company_id));

grant select, insert, update, delete on chat_channels, chat_members, chat_messages to turno_app;
grant execute on function chat_can_see(uuid) to turno_app;
