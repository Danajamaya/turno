// Which platform is worth it: per platform over the last 12 months, what each
// person leaves after fees (plus tips), how often they don't show up, and
// what they rate. Answers "where should I put my effort?".
import "server-only";
import { withUser } from "./db";
import type { Session } from "./types";

export interface PlatformStats { platform: string; bookings: number; people: number; avgGroup: number; netPerPersonCents: number; tipsPerPersonCents: number; feePct: number; noShowPct: number; cancelPct: number; rating: number | null; reviews: number }

export async function comparePlatforms(s: Session, months = 12): Promise<PlatformStats[]> {
  const from = new Date(Date.now() - months * 30 * 86_400_000);
  const rows = await withUser(s.userId, (tx) => tx<{ platform: string; bookings: number; people: number; came: number; noShow: number; cancelled: number; gross: number; fees: number; tips: number; rating: number | null; reviews: number }[]>`
    select b.platform, count(*)::int as bookings, coalesce(sum(b.people) filter (where b.status <> 'cancelled'), 0)::int as people,
           coalesce(sum(b.people) filter (where b.status = 'attended'), 0)::int as came, count(*) filter (where b.status = 'no_show')::int as no_show,
           count(*) filter (where b.status = 'cancelled')::int as cancelled, coalesce(sum(b.gross_cents) filter (where b.status <> 'cancelled'), 0)::int as gross,
           coalesce(sum(b.platform_fee_cents + b.turno_commission_cents) filter (where b.status <> 'cancelled'), 0)::int as fees,
           coalesce(sum(b.tips_cents), 0)::int as tips, round(avg(r.rating)::numeric, 1)::float as rating, count(r.id)::int as reviews
    from bookings b left join reviews r on r.booking_id = b.id and r.submitted_at is not null
    where b.company_id = ${s.company.id} and b.starts_at >= ${from} and b.starts_at < now()
    group by b.platform`);
  return rows.map((r) => {
    const done = Math.max(1, r.bookings - r.cancelled), ppl = Math.max(1, r.people);
    return { platform: r.platform, bookings: r.bookings, people: r.people, avgGroup: Math.round((r.people / done) * 10) / 10,
      netPerPersonCents: Math.round((r.gross - r.fees + r.tips) / ppl), tipsPerPersonCents: Math.round(r.tips / ppl), feePct: r.gross ? Math.round((r.fees / r.gross) * 100) : 0,
      noShowPct: Math.round((r.noShow / done) * 100), cancelPct: Math.round((r.cancelled / Math.max(1, r.bookings)) * 100), rating: r.rating, reviews: r.reviews };
  }).sort((a, b) => b.netPerPersonCents - a.netPerPersonCents);
}
