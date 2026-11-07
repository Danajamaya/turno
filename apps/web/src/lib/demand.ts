// Demand per tour and weekly slot over recent weeks, from every platform's
// bookings, turned into concrete ideas (see demandAdvice in @turno/core).
import "server-only";
import { demandAdvice, localDate, weekday, type Advice, type SlotStats } from "@turno/core";
import { withUser } from "./db";
import type { Session } from "./types";

export async function demandIdeas(s: Session, weeks = 8, now = new Date()): Promise<Advice[]> {
  if (s.member.role === "employee") return [];
  const tz = s.location.timezone;
  const rows = await withUser(s.userId, (tx) => tx<{ tourId: string; title: string; capacity: number; priceModel: SlotStats["priceModel"]; priceCents: number; startsAt: string; people: number }[]>`
    select t.id as tour_id, t.title, t.capacity, t.price_model, t.price_cents, b.starts_at, sum(b.people)::int as people
    from bookings b join tours t on t.company_id = b.company_id and t.title = b.tour_name
    where b.company_id = ${s.company.id} and b.status <> 'cancelled' and b.starts_at < ${now} and b.starts_at >= ${new Date(now.getTime() - weeks * 7 * 86_400_000)}
    group by t.id, t.title, t.capacity, t.price_model, t.price_cents, b.starts_at`);
  const hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz });
  const by = new Map<string, SlotStats>();
  for (const r of rows) {
    const at = new Date(r.startsAt), wd = weekday(localDate(at, tz)), time = hm.format(at);
    const key = `${r.tourId}|${wd}|${time}`;
    const cur = by.get(key) ?? { tourId: r.tourId, tourName: r.title, weekday: wd, time, departures: 0, people: 0, capacity: r.capacity, priceModel: r.priceModel, priceCents: r.priceCents };
    cur.departures++; cur.people += r.people;
    by.set(key, cur);
  }
  return demandAdvice([...by.values()]);
}
