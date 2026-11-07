// Team chat ("Equipo"): team channels and direct messages. Everything a person
// reads or writes goes through withUser(), so the RLS rules in
// db/migrations/0003_team_chat.sql decide visibility, not only this code.
import "server-only";
import { system, withUser } from "./db";
import { notifyMembers } from "./push";
import type { Session } from "./types";
import { RuleError } from "./types";

export interface ChatChannel { id: string; kind: "channel" | "direct"; name: string; topic: string | null; unread: number; otherMemberId: string | null; otherColour: number | null }
export interface TourCard { type: "tour"; startsAt: string; tourName: string; people: number; platforms: string[] }
export interface ChatMessage { id: string; channelId: string; memberId: string | null; authorName: string | null; authorColour: number | null; body: string; attachment: TourCard | null; createdAt: string }

const DEFAULTS: [string, string][] = [
  ["general", "Todo el equipo"],
  ["avisos-del-dia", "Lo que hay que saber hoy"],
  ["cambios-de-turno", "Pide o cubre un tour"],
];

/** The first time anyone opens the chat, the team gets its default channels. */
export async function ensureDefaultChannels(s: Session): Promise<void> {
  await system(async (tx) => {
    const [any] = await tx`select 1 from chat_channels where company_id = ${s.company.id} and kind = 'channel' limit 1`;
    if (any) return;
    for (const [name, topic] of DEFAULTS) {
      await tx`insert into chat_channels (company_id, kind, name, topic, created_by) values (${s.company.id}, 'channel', ${name}, ${topic}, ${s.member.id})
               on conflict (company_id, name) do nothing`;
    }
  });
}

export async function listChannels(s: Session): Promise<ChatChannel[]> {
  return withUser(s.userId, (tx) => tx<ChatChannel[]>`
    select ch.id, ch.kind, coalesce(ch.name, other.full_name, 'Mensaje directo') as name, ch.topic,
           other.id as other_member_id, other.colour as other_colour,
           (select count(*)::int from chat_messages m
             where m.channel_id = ch.id and m.deleted_at is null and m.member_id is distinct from ${s.member.id}
               and m.created_at > coalesce(me.last_read_at, '-infinity')) as unread
    from chat_channels ch
    left join chat_members me on me.channel_id = ch.id and me.member_id = ${s.member.id}
    left join lateral (
      select mem.id, mem.full_name, mem.colour from chat_members cm join members mem on mem.id = cm.member_id
      where cm.channel_id = ch.id and cm.in_direct and cm.member_id <> ${s.member.id} limit 1
    ) other on ch.kind = 'direct'
    where ch.company_id = ${s.company.id} and ch.archived_at is null
    order by ch.kind, ch.created_at`);
}

export async function unreadTotal(s: Session): Promise<number> {
  return (await listChannels(s)).reduce((n, c) => n + c.unread, 0);
}

/** The direct message between the signed-in person and a teammate, created on first use. */
export async function openDirect(s: Session, otherMemberId: string): Promise<string> {
  if (otherMemberId === s.member.id) throw new RuleError("self", "No puedes escribirte a ti mismo.");
  return system(async (tx) => {
    const [other] = await tx`select 1 from members where id = ${otherMemberId} and company_id = ${s.company.id} and status <> 'archived'`;
    if (!other) throw new RuleError("not_found", "Esa persona no está en tu equipo.");
    const [found] = await tx<{ id: string }[]>`
      select ch.id from chat_channels ch
      where ch.company_id = ${s.company.id} and ch.kind = 'direct'
        and exists (select 1 from chat_members a where a.channel_id = ch.id and a.in_direct and a.member_id = ${s.member.id})
        and exists (select 1 from chat_members b where b.channel_id = ch.id and b.in_direct and b.member_id = ${otherMemberId})`;
    if (found) return found.id;
    const [ch] = await tx<{ id: string }[]>`insert into chat_channels (company_id, kind, created_by) values (${s.company.id}, 'direct', ${s.member.id}) returning id`;
    await tx`insert into chat_members (channel_id, member_id, company_id, in_direct) values
             (${ch.id}, ${s.member.id}, ${s.company.id}, true), (${ch.id}, ${otherMemberId}, ${s.company.id}, true)`;
    return ch.id;
  });
}

export async function createChannel(s: Session, name: string, topic: string | null): Promise<string> {
  const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  if (!slug) throw new RuleError("invalid", "Escribe un nombre para el canal.");
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede crear canales.");
  return withUser(s.userId, async (tx) => {
    const [ch] = await tx<{ id: string }[]>`
      insert into chat_channels (company_id, kind, name, topic, created_by) values (${s.company.id}, 'channel', ${slug}, ${topic}, ${s.member.id})
      on conflict (company_id, name) do nothing returning id`;
    if (!ch) throw new RuleError("exists", `Ya existe #${slug}.`);
    return ch.id;
  });
}

export async function messages(s: Session, channelId: string, after?: string): Promise<ChatMessage[]> {
  return withUser(s.userId, async (tx) => {
    const rows = await tx<ChatMessage[]>`
      select m.id, m.channel_id, m.member_id, mem.full_name as author_name, mem.colour as author_colour, m.body, m.attachment, m.created_at
      from chat_messages m left join members mem on mem.id = m.member_id
      where m.channel_id = ${channelId} and m.deleted_at is null ${after ? tx`and m.created_at > ${after}` : tx``}
      order by m.created_at desc limit 200`;
    return rows.reverse();
  });
}

export async function markRead(s: Session, channelId: string): Promise<void> {
  await withUser(s.userId, (tx) => tx`
    insert into chat_members (channel_id, member_id, company_id, last_read_at) values (${channelId}, ${s.member.id}, ${s.company.id}, now())
    on conflict (channel_id, member_id) do update set last_read_at = now()`);
}

export async function send(s: Session, channelId: string, body: string, attachment: TourCard | null = null): Promise<ChatMessage> {
  const text = body.trim();
  if (!text) throw new RuleError("empty", "Escribe un mensaje.");
  if (text.length > 4000) throw new RuleError("too_long", "El mensaje es demasiado largo.");
  const sent = await withUser(s.userId, async (tx) => {
    const [visible] = await tx`select 1 from chat_channels where id = ${channelId}`;
    if (!visible) throw new RuleError("not_found", "Ese chat no existe o no puedes verlo.");
    const [m] = await tx<ChatMessage[]>`
      insert into chat_messages (company_id, channel_id, member_id, body, attachment)
      values (${s.company.id}, ${channelId}, ${s.member.id}, ${text}, ${attachment ? tx.json(attachment as never) : null})
      returning id, channel_id, member_id, body, attachment, created_at`;
    await tx`insert into chat_members (channel_id, member_id, company_id, last_read_at) values (${channelId}, ${s.member.id}, ${s.company.id}, now())
             on conflict (channel_id, member_id) do update set last_read_at = now()`;
    const others = await tx<{ memberId: string }[]>`select member_id from chat_members where channel_id = ${channelId} and in_direct and member_id <> ${s.member.id}`;
    return { message: { ...m, authorName: s.member.fullName, authorColour: s.member.colour }, others: others.map((o) => o.memberId) };
  });
  // direct messages buzz the other person's phone; team channels don't, to keep it calm
  if (sent.others.length) await notifyMembers(s.company.id, { memberIds: sent.others }, { title: s.member.fullName, body: text.slice(0, 140), url: `/equipo?c=${channelId}` }).catch(() => 0);
  return sent.message;
}

export async function teammates(s: Session) {
  return withUser(s.userId, (tx) => tx<{ id: string; fullName: string; role: string; colour: number; jobTitle: string | null }[]>`
    select id, full_name, role, colour, job_title from members
    where company_id = ${s.company.id} and status <> 'archived' and id <> ${s.member.id} order by full_name`);
}
