// Operators with several guides: who leads each tour, and what each guide is
// owed for the month. Assignment suggestions skip guides who are on approved
// time off or already leading an overlapping tour, prefer guides who speak the
// group's language, and spread tours evenly. Pay = per tour + per person +
// a share of the tips, per guide.
import "server-only";
import { withUser } from "./db";
import { groupKey } from "./guide-app";
import type { Session } from "./types";
import { RuleError } from "./types";

const managerOnly = (s: Session) => { if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede hacer esto."); };

export interface PayRule { memberId: string; fullName: string; perTourCents: number; perPersonCents: number; tipShareBps: number; languages: string[] }

export async function payRules(s: Session): Promise<PayRule[]> {
  managerOnly(s);
  return withUser(s.userId, (tx) => tx<PayRule[]>`
    select m.id as member_id, m.full_name, coalesce(r.per_tour_cents, 0) as per_tour_cents, coalesce(r.per_person_cents, 0) as per_person_cents,
           coalesce(r.tip_share_bps, 10000) as tip_share_bps, coalesce(r.languages, '{}') as languages
    from members m left join member_pay_rules r on r.member_id = m.id
    where m.company_id = ${s.company.id} and m.status <> 'archived' and m.role = 'employee' order by m.full_name`);
}

export async function savePayRule(s: Session, r: Omit<PayRule, "fullName">): Promise<void> {
  managerOnly(s);
  if ([r.perTourCents, r.perPersonCents].some((c) => !Number.isInteger(c) || c < 0 || c > 1_000_000)) throw new RuleError("invalid", "Revisa los importes.");
  if (!Number.isInteger(r.tipShareBps) || r.tipShareBps < 0 || r.tipShareBps > 10_000) throw new RuleError("invalid", "El reparto de propinas va de 0 a 100 %.");
  await withUser(s.userId, async (tx) => {
    const [m] = await tx`select 1 from members where id = ${r.memberId} and company_id = ${s.company.id}`;
    if (!m) throw new RuleError("not_found", "Esa persona no está en tu equipo.");
    await tx`insert into member_pay_rules (member_id, company_id, per_tour_cents, per_person_cents, tip_share_bps, languages)
      values (${r.memberId}, ${s.company.id}, ${r.perTourCents}, ${r.perPersonCents}, ${r.tipShareBps}, ${r.languages})
      on conflict (member_id) do update set per_tour_cents = excluded.per_tour_cents, per_person_cents = excluded.per_person_cents,
        tip_share_bps = excluded.tip_share_bps, languages = excluded.languages`;
  });
}

export interface PayLine { memberId: string; fullName: string; tours: number; people: number; tipsCents: number; payCents: number; tipShareCents: number }

/** What each guide earned in [from, to): tours they led that ran (not cancelled), people who came, their tip share. */
export async function guidePay(s: Session, from: Date, to: Date): Promise<PayLine[]> {
  const rules = await payRules(s);
  const rows = await withUser(s.userId, (tx) => tx<{ memberId: string; tours: number; people: number; tipsCents: number }[]>`
    select guide_member_id as member_id, count(distinct (starts_at, tour_name))::int as tours,
           coalesce(sum(people) filter (where status = 'attended'), 0)::int as people, coalesce(sum(tips_cents), 0)::int as tips_cents
    from bookings where company_id = ${s.company.id} and guide_member_id is not null and starts_at >= ${from} and starts_at < ${to}
      and status in ('attended', 'no_show') group by guide_member_id`);
  return rules.map((r) => {
    const w = rows.find((x) => x.memberId === r.memberId) ?? { tours: 0, people: 0, tipsCents: 0 };
    const tipShareCents = Math.round((w.tipsCents * r.tipShareBps) / 10_000);
    return { memberId: r.memberId, fullName: r.fullName, tours: w.tours, people: w.people, tipsCents: w.tipsCents, tipShareCents,
      payCents: r.perTourCents * w.tours + r.perPersonCents * w.people + tipShareCents };
  });
}

export interface Suggestion { key: string; startsAt: string; tourName: string; memberId: string; fullName: string; reason: string }

/** A guide for every tour without one in [from, to). Nothing is saved; see applySuggestions. */
export async function suggestAssignments(s: Session, from: Date, to: Date): Promise<Suggestion[]> {
  const rules = await payRules(s);
  if (!rules.length) return [];
  return withUser(s.userId, async (tx) => {
    const groups = await tx<{ startsAt: string; tourName: string | null; durationMin: number | null; assigned: string | null; languages: string[] }[]>`
      select b.starts_at, b.tour_name, max(t.duration_min) as duration_min, max(b.guide_member_id::text) as assigned,
             coalesce(array_agg(distinct tr.language) filter (where tr.language is not null), '{}') as languages
      from bookings b left join tours t on t.company_id = b.company_id and t.title = b.tour_name left join travellers tr on tr.id = b.traveller_id
      where b.company_id = ${s.company.id} and b.status <> 'cancelled' and b.starts_at >= ${new Date(from.getTime() - 86_400_000)} and b.starts_at < ${to}
      group by b.starts_at, b.tour_name order by b.starts_at`;
    const off = await tx<{ memberId: string; startAt: string; endAt: string }[]>`select member_id, start_at, end_at from time_off_requests
      where company_id = ${s.company.id} and status = 'approved' and end_at > ${from} and start_at < ${to}`;
    const span = (g: { startsAt: string; durationMin: number | null }) => [new Date(g.startsAt).getTime(), new Date(g.startsAt).getTime() + (g.durationMin ?? 120) * 60_000] as const;
    const busy = new Map<string, (readonly [number, number])[]>(rules.map((r) => [r.memberId, []]));
    const load = new Map<string, number>(rules.map((r) => [r.memberId, 0]));
    for (const g of groups) if (g.assigned && busy.has(g.assigned)) { busy.get(g.assigned)!.push(span(g)); load.set(g.assigned, load.get(g.assigned)! + 1); }
    const out: Suggestion[] = [];
    for (const g of groups) {
      if (g.assigned || new Date(g.startsAt) < from) continue;
      const [a, b] = span(g);
      const lang = g.languages.includes("en") ? "en" : g.languages.includes("es") ? "es" : null;
      const speaks = (r: PayRule) => !lang || r.languages.length === 0 || r.languages.some((l) => l.toLowerCase().startsWith(lang === "en" ? "en" : "es") || (lang === "en" && /ingl/i.test(l)) || (lang === "es" && /spanish|españ/i.test(l)));
      const free = rules.filter((r) => !busy.get(r.memberId)!.some(([x, y]) => x < b && a < y)
        && !off.some((o) => o.memberId === r.memberId && new Date(o.startAt).getTime() < b && a < new Date(o.endAt).getTime()));
      if (!free.length) continue;
      const pool = free.filter(speaks).length ? free.filter(speaks) : free;
      const pick = [...pool].sort((x, y) => load.get(x.memberId)! - load.get(y.memberId)! || x.fullName.localeCompare(y.fullName))[0];
      busy.get(pick.memberId)!.push([a, b]); load.set(pick.memberId, load.get(pick.memberId)! + 1);
      out.push({ key: groupKey(g.startsAt, g.tourName), startsAt: g.startsAt, tourName: g.tourName ?? "Tour", memberId: pick.memberId, fullName: pick.fullName,
        reason: lang && pick.languages.length && speaks(pick) ? `habla ${lang === "en" ? "inglés" : "español"}, el idioma del grupo` : "libre a esa hora y con menos tours asignados" });
    }
    return out;
  });
}

/** Save the suggested guides; returns how many tours got one. */
export async function applySuggestions(s: Session, from: Date, to: Date): Promise<number> {
  const { assignGuide } = await import("./guide-app");
  const list = await suggestAssignments(s, from, to);
  for (const x of list) await assignGuide(s, x.key, x.memberId);
  return list.length;
}
