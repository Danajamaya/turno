// Agencies working in several cities: each city is a location with its own
// time zone; tours belong to a city, and the panel compares cities side by
// side. More than one city needs a paid plan (Agencia).
import "server-only";
import { system, withUser } from "./db";
import type { Session } from "./types";
import { RuleError } from "./types";

export async function listLocations(s: Session): Promise<{ id: string; name: string; timezone: string }[]> {
  return withUser(s.userId, (tx) => tx<{ id: string; name: string; timezone: string }[]>`select id, name, timezone from locations where company_id = ${s.company.id} and archived_at is null order by created_at`);
}

export async function addCity(s: Session, name: string, timezone: string): Promise<void> {
  if (s.member.role !== "owner") throw new RuleError("forbidden", "Solo la persona dueña de la cuenta puede añadir ciudades.");
  if (!name.trim()) throw new RuleError("name", "Escribe el nombre de la ciudad.");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new RuleError("timezone", "Zona horaria no válida."); }
  await system(async (tx) => {
    const [{ plan }] = await tx<{ plan: string }[]>`select coalesce((select plan from subscriptions where company_id = ${s.company.id}), 'free') as plan`;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from locations where company_id = ${s.company.id} and archived_at is null`;
    if (plan !== "plus" && n >= 1) throw new RuleError("plan_limit", "Para trabajar en varias ciudades necesitas el plan Agencia.");
    const [l] = await tx<{ id: string }[]>`insert into locations (company_id, name, timezone) values (${s.company.id}, ${name.trim().slice(0, 80)}, ${timezone}) returning id`;
    await tx`insert into location_members (location_id, member_id, company_id) values (${l.id}, ${s.member.id}, ${s.company.id}) on conflict do nothing`;
  });
}

export interface CityLine { locationId: string; city: string; tours: number; bookings: number; people: number; netCents: number; tipsCents: number; guides: number }

/** Per city in [from, to): bookings are placed in the city of their tour (or the first city when the tour is unknown). */
export async function cityReport(s: Session, from: Date, to: Date): Promise<CityLine[]> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede ver esto.");
  return withUser(s.userId, (tx) => tx<CityLine[]>`
    with first as (select id from locations where company_id = ${s.company.id} and archived_at is null order by created_at limit 1),
    b as (
      select coalesce(t.location_id, (select id from first)) as location_id, bk.*
      from bookings bk left join tours t on t.company_id = bk.company_id and t.title = bk.tour_name
      where bk.company_id = ${s.company.id} and bk.status <> 'cancelled' and bk.starts_at >= ${from} and bk.starts_at < ${to})
    select l.id as location_id, l.name as city,
           (select count(*)::int from tours t where t.company_id = ${s.company.id} and coalesce(t.location_id, (select id from first)) = l.id and t.published) as tours,
           count(b.id)::int as bookings, coalesce(sum(b.people), 0)::int as people,
           coalesce(sum(b.gross_cents - b.platform_fee_cents - b.turno_commission_cents + b.tips_cents), 0)::int as net_cents,
           coalesce(sum(b.tips_cents), 0)::int as tips_cents, count(distinct b.guide_member_id)::int as guides
    from locations l left join b on b.location_id = l.id
    where l.company_id = ${s.company.id} and l.archived_at is null group by l.id, l.name, l.created_at order by l.created_at`);
}
