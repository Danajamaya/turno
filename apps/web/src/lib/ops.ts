// The day of the tour: where the group is right now (for latecomers), notes
// per booking, swapping a tour with another guide, and the equipment list.
import "server-only";
import { system, withUser } from "./db";
import { appUrl } from "./email";
import { parseKey } from "./guide-app";
import { notifyMembers } from "./push";
import { canSign, sign, verify } from "./sign";
import type { Session } from "./types";
import { RuleError } from "./types";

/** Only the tour's guide or a manager may act on a tour. */
async function mayRunTour(s: Session, startsAt: string, tourName: string): Promise<void> {
  const [row] = await system((tx) => tx<{ guide: string | null }[]>`select guide_member_id as guide from bookings where company_id = ${s.company.id}
    and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName} and status <> 'cancelled' limit 1`);
  if (!row) throw new RuleError("not_found", "Ese tour no existe.");
  if (s.member.role === "employee" && row.guide !== s.member.id) throw new RuleError("forbidden", "Ese tour no es tuyo.");
}

// ------------------------------------------------------------- where is the group

interface GroupToken { c: string; s: string; t: string }

export function groupLink(companyId: string, startsAt: string, tourName: string): string | null {
  return canSign() ? `${appUrl()}/grupo/${sign({ c: companyId, s: startsAt, t: tourName } satisfies GroupToken)}` : null;
}

export async function shareLocation(s: Session, key: string, lat: number, lng: number): Promise<void> {
  const { startsAt, tourName } = parseKey(key);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) throw new RuleError("invalid", "Ubicación no válida.");
  await mayRunTour(s, startsAt, tourName);
  await withUser(s.userId, (tx) => tx`insert into live_locations (company_id, starts_at, tour_name, member_id, lat, lng) values (${s.company.id}, ${startsAt}, ${tourName}, ${s.member.id}, ${lat}, ${lng})
    on conflict (company_id, starts_at, tour_name) do update set lat = excluded.lat, lng = excluded.lng, member_id = excluded.member_id, updated_at = now()`);
}

/** For the traveller's private link: the meeting point and, during the tour, the group's last position. */
export async function groupWhere(token: string) {
  const p = verify<GroupToken>(token);
  if (!p) return null;
  return system(async (tx) => {
    const [t] = await tx<{ companyName: string; meetingPoint: string | null; timezone: string; durationMin: number | null; stops: { name: string; lat: number | null; lng: number | null }[] | null }[]>`
      select c.name as company_name, t.meeting_point, (select timezone from locations where company_id = c.id order by created_at limit 1) as timezone, t.duration_min, t.stops
      from companies c left join tours t on t.company_id = c.id and t.title = ${p.t} where c.id = ${p.c} limit 1`;
    if (!t) return null;
    const [loc] = await tx<{ lat: number; lng: number; updatedAt: string }[]>`select lat, lng, updated_at from live_locations where company_id = ${p.c} and starts_at = ${p.s} and tour_name = ${p.t}`;
    const end = new Date(p.s).getTime() + (t.durationMin ?? 180) * 60_000;
    // the position is only shown around the tour itself, never days later
    const live = loc && Date.now() < end + 30 * 60_000 && Date.now() - new Date(loc.updatedAt).getTime() < 60 * 60_000 ? loc : null;
    return { ...t, tourName: p.t, startsAt: p.s, live };
  });
}

// ------------------------------------------------------------- notes per booking

export async function saveBookingNotes(s: Session, bookingId: string, notes: string, children: number): Promise<void> {
  if (!Number.isInteger(children) || children < 0 || children > 100) throw new RuleError("invalid", "Revisa el número de niños.");
  await system(async (tx) => {
    const [b] = await tx<{ guide: string | null }[]>`select guide_member_id as guide from bookings where id = ${bookingId} and company_id = ${s.company.id}`;
    if (!b) throw new RuleError("not_found", "No se encontró esa reserva.");
    if (s.member.role === "employee" && b.guide !== s.member.id) throw new RuleError("forbidden", "Esa reserva no es de tu tour.");
    await tx`update bookings set notes = ${notes.trim().slice(0, 500) || null}, children = ${children} where id = ${bookingId}`;
  });
}

// ------------------------------------------------------------- swaps between guides

export interface Swap { id: string; startsAt: string; tourName: string; fromName: string; fromMemberId: string; note: string | null; status: string }

export async function requestSwap(s: Session, key: string, note: string): Promise<string> {
  const { startsAt, tourName } = parseKey(key);
  const [mine] = await system((tx) => tx`select 1 from bookings where company_id = ${s.company.id} and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName}
    and guide_member_id = ${s.member.id} and status <> 'cancelled' limit 1`);
  if (!mine) throw new RuleError("forbidden", "Solo puedes pedir cambio de un tour que llevas tú.");
  if (new Date(startsAt) < new Date()) throw new RuleError("past", "Ese tour ya empezó.");
  const id = await system(async (tx) => {
    const [open] = await tx<{ id: string }[]>`select id from tour_swaps where company_id = ${s.company.id} and starts_at = ${startsAt} and tour_name = ${tourName} and status = 'open'`;
    if (open) return open.id;
    const [row] = await tx<{ id: string }[]>`insert into tour_swaps (company_id, starts_at, tour_name, from_member_id, note) values (${s.company.id}, ${startsAt}, ${tourName}, ${s.member.id}, ${note.trim().slice(0, 300) || null}) returning id`;
    // also posted in the team's #cambios-de-turno channel, so everyone sees it
    const [ch] = await tx<{ id: string }[]>`select id from chat_channels where company_id = ${s.company.id} and name = 'cambios-de-turno'`;
    if (ch) await tx`insert into chat_messages (company_id, channel_id, member_id, body, attachment) values (${s.company.id}, ${ch.id}, ${s.member.id},
      ${`¿Alguien puede llevar este tour?${note.trim() ? ` ${note.trim().slice(0, 300)}` : ""} Cógelo desde «Mi día».`}, ${tx.json({ type: "tour", startsAt, tourName, people: 0, platforms: [] } as never)})`;
    return row.id;
  });
  const others = await system((tx) => tx<{ id: string }[]>`select id from members where company_id = ${s.company.id} and role = 'employee' and status = 'active' and id <> ${s.member.id}`);
  await notifyMembers(s.company.id, { memberIds: others.map((o) => o.id) }, { title: "Cambio de tour", body: `${s.member.fullName} busca quien lleve ${tourName}`, url: "/clock" }).catch(() => 0);
  return id;
}

export async function openSwaps(s: Session): Promise<Swap[]> {
  return withUser(s.userId, (tx) => tx<Swap[]>`select w.id, w.starts_at, w.tour_name, m.full_name as from_name, w.from_member_id, w.note, w.status
    from tour_swaps w join members m on m.id = w.from_member_id
    where w.company_id = ${s.company.id} and w.status = 'open' and w.starts_at > now() order by w.starts_at`);
}

/** Another guide takes the tour: refused if they are already leading something at that time. */
export async function takeSwap(s: Session, swapId: string): Promise<void> {
  const taken = await system(async (tx) => {
    const [w] = await tx<{ startsAt: string; tourName: string; fromMemberId: string }[]>`select starts_at, tour_name, from_member_id from tour_swaps
      where id = ${swapId} and company_id = ${s.company.id} and status = 'open' and starts_at > now() for update`;
    if (!w) throw new RuleError("gone", "Ese cambio ya no está disponible.");
    if (w.fromMemberId === s.member.id) throw new RuleError("own", "Ese tour ya es tuyo.");
    const [busy] = await tx`select 1 from bookings b left join tours t on t.company_id = b.company_id and t.title = b.tour_name
      where b.company_id = ${s.company.id} and b.guide_member_id = ${s.member.id} and b.status <> 'cancelled'
        and b.starts_at < ${w.startsAt}::timestamptz + interval '3 hours' and b.starts_at + make_interval(mins => coalesce(t.duration_min, 120)) > ${w.startsAt}::timestamptz limit 1`;
    if (busy) throw new RuleError("busy", "Ya llevas un tour a esa hora.");
    await tx`update bookings set guide_member_id = ${s.member.id} where company_id = ${s.company.id} and starts_at = ${w.startsAt} and coalesce(tour_name, '') = ${w.tourName} and status <> 'cancelled'`;
    await tx`update tour_swaps set status = 'taken', to_member_id = ${s.member.id}, taken_at = now() where id = ${swapId}`;
    return w;
  });
  await notifyMembers(s.company.id, { managers: true, memberIds: [taken.fromMemberId] }, { title: "Cambio hecho", body: `${s.member.fullName} lleva ${taken.tourName}`, url: "/calendario" }).catch(() => 0);
}

// ------------------------------------------------------------- equipment

export async function equipmentState(s: Session, key: string): Promise<{ items: string[]; checked: string[] }> {
  const { startsAt, tourName } = parseKey(key);
  return withUser(s.userId, async (tx) => {
    const [t] = await tx<{ equipment: string[] }[]>`select equipment from tours where company_id = ${s.company.id} and title = ${tourName}`;
    const done = await tx<{ item: string }[]>`select item from equipment_checks where company_id = ${s.company.id} and starts_at = ${startsAt} and tour_name = ${tourName}`;
    return { items: t?.equipment ?? [], checked: done.map((d) => d.item) };
  });
}

export async function toggleEquipment(s: Session, key: string, item: string, checked: boolean): Promise<void> {
  const { startsAt, tourName } = parseKey(key);
  await mayRunTour(s, startsAt, tourName);
  await withUser(s.userId, (tx) => checked
    ? tx`insert into equipment_checks (company_id, starts_at, tour_name, item, checked_by) values (${s.company.id}, ${startsAt}, ${tourName}, ${item.slice(0, 60)}, ${s.member.id}) on conflict do nothing`
    : tx`delete from equipment_checks where company_id = ${s.company.id} and starts_at = ${startsAt} and tour_name = ${tourName} and item = ${item}`);
}
