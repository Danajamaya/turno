// Running a tour: managers assign a guide to each tour (every booking at that
// time and tour, whatever the platform), the guide sees their tours, checks
// people in at the meeting point and closes the tour with the tips.
import "server-only";
import { system, withUser, type Tx } from "./db";
import { cardTipsCents, splitTips } from "./tips";
import type { Session } from "./types";
import { RuleError } from "./types";

export interface Attendee { id: string; platform: string; externalRef: string; people: number; status: string; travellerName: string | null; travellerPhone: string | null; checkedInAt: string | null }
export interface TourGroup { key: string; startsAt: string; tourName: string; people: number; platforms: string[]; guideMemberId: string | null; guideName: string | null; tipsCents: number; attendees: Attendee[] }

export const groupKey = (startsAt: string, tourName: string | null) => `${startsAt}|${tourName ?? ""}`;
export function parseKey(key: string): { startsAt: string; tourName: string } {
  const i = key.indexOf("|");
  if (i < 0 || Number.isNaN(Date.parse(key.slice(0, i)))) throw new RuleError("invalid", "Tour no válido.");
  return { startsAt: new Date(key.slice(0, i)).toISOString(), tourName: key.slice(i + 1) };
}

async function load(tx: Tx, s: Session, from: Date, to: Date, onlyMine: boolean): Promise<TourGroup[]> {
  const rows = await tx<(Attendee & { startsAt: string; tourName: string | null; guideMemberId: string | null; guideName: string | null; tipsCents: number })[]>`
    select b.id, b.platform, b.external_ref, b.people, b.status, b.checked_in_at, b.starts_at, b.tour_name, b.guide_member_id, b.tips_cents,
           t.name as traveller_name, t.phone as traveller_phone, g.full_name as guide_name
    from bookings b left join travellers t on t.id = b.traveller_id left join members g on g.id = b.guide_member_id
    where b.company_id = ${s.company.id} and b.starts_at >= ${from} and b.starts_at < ${to} and b.status <> 'cancelled'
      ${onlyMine ? tx`and b.guide_member_id = ${s.member.id}` : tx``}
    order by b.starts_at, b.tour_name, b.created_at`;
  const by = new Map<string, TourGroup>();
  for (const r of rows) {
    const key = groupKey(r.startsAt, r.tourName);
    const g = by.get(key) ?? { key, startsAt: r.startsAt, tourName: r.tourName ?? "Tour", people: 0, platforms: [], guideMemberId: r.guideMemberId, guideName: r.guideName, tipsCents: 0, attendees: [] };
    g.people += r.people; g.tipsCents += r.tipsCents;
    if (!g.platforms.includes(r.platform)) g.platforms.push(r.platform);
    if (g.guideMemberId !== r.guideMemberId) { g.guideMemberId = null; g.guideName = null; } // mixed: not fully assigned
    g.attendees.push({ id: r.id, platform: r.platform, externalRef: r.externalRef, people: r.people, status: r.status, travellerName: r.travellerName, travellerPhone: r.travellerPhone, checkedInAt: r.checkedInAt });
    by.set(key, g);
  }
  return [...by.values()];
}

/** Every tour in a period (managers). */
export async function tourGroups(s: Session, from: Date, to: Date): Promise<TourGroup[]> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede ver todos los tours.");
  return withUser(s.userId, (tx) => load(tx, s, from, to, false));
}

/** The tours assigned to the signed-in guide; row level security shows them nothing else. */
export async function myTours(s: Session, from: Date, to: Date): Promise<TourGroup[]> {
  return withUser(s.userId, (tx) => load(tx, s, from, to, true));
}

export async function assignGuide(s: Session, key: string, memberId: string | null): Promise<number> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede asignar tours.");
  const { startsAt, tourName } = parseKey(key);
  return withUser(s.userId, async (tx) => {
    if (memberId) {
      const [m] = await tx`select 1 from members where id = ${memberId} and company_id = ${s.company.id} and status <> 'archived'`;
      if (!m) throw new RuleError("not_found", "Esa persona no está en tu equipo.");
    }
    const rows = await tx`update bookings set guide_member_id = ${memberId}
      where company_id = ${s.company.id} and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName} and status <> 'cancelled' returning id`;
    return rows.length;
  });
}

/** May this person run this tour? Its guide, or any manager of the company. */
async function mayRun(tx: Tx, s: Session, where: { bookingId?: string; startsAt?: string; tourName?: string }) {
  if (s.member.role !== "employee") return;
  const [row] = where.bookingId
    ? await tx`select 1 from bookings where id = ${where.bookingId} and company_id = ${s.company.id} and guide_member_id = ${s.member.id}`
    : await tx`select 1 from bookings where company_id = ${s.company.id} and starts_at = ${where.startsAt!} and coalesce(tour_name, '') = ${where.tourName!} and guide_member_id = ${s.member.id}`;
  if (!row) throw new RuleError("forbidden", "Ese tour no es tuyo.");
}

/** At the meeting point: this booking came (or not). Written as system after the check above. */
export async function checkIn(s: Session, bookingId: string, present: boolean): Promise<void> {
  await system(async (tx) => {
    await mayRun(tx, s, { bookingId });
    const rows = await tx`update bookings set status = ${present ? "attended" : "no_show"}, checked_in_at = ${present ? new Date() : null}
      where id = ${bookingId} and company_id = ${s.company.id} and status <> 'cancelled' returning id`;
    if (!rows.length) throw new RuleError("not_found", "No se encontró esa reserva.");
  });
}

/**
 * After the tour: the tips collected, split across the bookings that came in
 * proportion to their people, so income per platform stays right. Bookings
 * nobody marked are counted as attended.
 */
export async function closeTour(s: Session, key: string, tipsCents: number): Promise<void> {
  if (!Number.isInteger(tipsCents) || tipsCents < 0 || tipsCents > 100_000_00) throw new RuleError("invalid", "Revisa el importe de las propinas.");
  const { startsAt, tourName } = parseKey(key);
  await system(async (tx) => {
    await mayRun(tx, s, { startsAt, tourName });
    await tx`update bookings set status = 'attended' where company_id = ${s.company.id} and starts_at = ${startsAt}
             and coalesce(tour_name, '') = ${tourName} and status = 'confirmed'`;
    const [{ total }] = await tx<{ total: number }[]>`select coalesce(sum(people), 0)::int as total from bookings where company_id = ${s.company.id}
             and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName} and status = 'attended'`;
    if (total === 0) { if (tipsCents > 0) throw new RuleError("nobody", "Nadie marcado como presente: no hay a quién asignar las propinas."); return; }
    // cash entered now plus tips already paid by card through the tour's QR
    await splitTips(tx, s.company.id, startsAt, tourName, tipsCents + await cardTipsCents(s.company.id, startsAt, tourName, tx));
  });
}
