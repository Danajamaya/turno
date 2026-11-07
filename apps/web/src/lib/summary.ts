// The weekly summary: last week in numbers for every manager, by email, on
// Monday morning. Sent by a scheduled call to /api/cron/weekly (see
// replica/backend.md); each company gets it at most once every six days.
import "server-only";
import { system } from "./db";
import { appUrl, sendEmail } from "./email";
import { platformName } from "./guides";

export interface WeekNumbers { companyName: string; currency: string; bookings: number; people: number; grossCents: number; tipsCents: number; reviews: number; avgRating: number | null; best: { tourName: string; people: number } | null; byPlatform: { platform: string; people: number }[]; nextWeekPeople: number }

export async function weekNumbers(companyId: string, now = new Date()): Promise<WeekNumbers> {
  const from = new Date(now.getTime() - 7 * 86_400_000), next = new Date(now.getTime() + 7 * 86_400_000);
  return system(async (tx) => {
    const [c] = await tx<{ name: string; currency: string }[]>`select name, currency from companies where id = ${companyId}`;
    const [t] = await tx<{ bookings: number; people: number; grossCents: number; tipsCents: number }[]>`
      select count(*)::int as bookings, coalesce(sum(people), 0)::int as people, coalesce(sum(gross_cents), 0)::int as gross_cents, coalesce(sum(tips_cents), 0)::int as tips_cents
      from bookings where company_id = ${companyId} and status <> 'cancelled' and starts_at >= ${from} and starts_at < ${now}`;
    const [best] = await tx<{ tourName: string; people: number }[]>`select coalesce(tour_name, 'Tour') as tour_name, sum(people)::int as people from bookings
      where company_id = ${companyId} and status <> 'cancelled' and starts_at >= ${from} and starts_at < ${now} group by tour_name order by 2 desc limit 1`;
    const byPlatform = await tx<{ platform: string; people: number }[]>`select platform, sum(people)::int as people from bookings
      where company_id = ${companyId} and status <> 'cancelled' and starts_at >= ${from} and starts_at < ${now} group by platform order by 2 desc`;
    const [r] = await tx<{ n: number; avg: number | null }[]>`select count(*)::int as n, round(avg(rating)::numeric, 1)::float as avg from reviews
      where company_id = ${companyId} and submitted_at >= ${from} and submitted_at < ${now}`;
    const [n] = await tx<{ people: number }[]>`select coalesce(sum(people), 0)::int as people from bookings where company_id = ${companyId} and status <> 'cancelled' and starts_at >= ${now} and starts_at < ${next}`;
    return { companyName: c.name, currency: c.currency, ...t, reviews: r.n, avgRating: r.avg, best: best ?? null, byPlatform, nextWeekPeople: n.people };
  });
}

const eur = (c: number, cur: string) => new Intl.NumberFormat("es-ES", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(c / 100);

export function summaryText(w: WeekNumbers): { subject: string; text: string } {
  const lines = [
    `Esta semana en ${w.companyName}:`, "",
    `• ${w.people} personas en ${w.bookings} reservas`,
    w.grossCents > 0 ? `• ${eur(w.grossCents, w.currency)} vendidos` : null,
    w.tipsCents > 0 ? `• ${eur(w.tipsCents, w.currency)} en propinas` : null,
    w.best ? `• Tu tour con más gente: ${w.best.tourName} (${w.best.people} personas)` : null,
    w.byPlatform.length ? `• De dónde vinieron: ${w.byPlatform.map((p) => `${platformName[p.platform] ?? p.platform} ${p.people}`).join(", ")}` : null,
    w.reviews > 0 ? `• ${w.reviews} ${w.reviews === 1 ? "reseña nueva" : "reseñas nuevas"}, media ${w.avgRating?.toLocaleString("es-ES")} ★` : null,
    "", `La semana que viene ya tienes ${w.nextWeekPeople} personas reservadas.`, "", `Ver todo en Turno: ${appUrl()}/inicio`,
    "", "Puedes dejar de recibir este resumen en Configuración.",
  ].filter((l) => l !== null);
  return { subject: `Tu semana: ${w.people} personas${w.grossCents ? `, ${eur(w.grossCents, w.currency)}` : ""}`, text: lines.join("\n") };
}

/** Send to every company that wants it and hasn't had one in six days. Returns how many companies were sent. */
export async function sendWeeklySummaries(now = new Date()): Promise<number> {
  const due = await system((tx) => tx<{ id: string }[]>`select id from companies where weekly_summary
    and (weekly_summary_sent_at is null or weekly_summary_sent_at < ${new Date(now.getTime() - 6 * 86_400_000)})`);
  let sent = 0;
  for (const { id } of due) {
    // claim first so two overlapping runs never send twice
    const [claimed] = await system((tx) => tx`update companies set weekly_summary_sent_at = ${now} where id = ${id}
      and (weekly_summary_sent_at is null or weekly_summary_sent_at < ${new Date(now.getTime() - 6 * 86_400_000)}) returning id`);
    if (!claimed) continue;
    const w = await weekNumbers(id, now);
    const managers = await system((tx) => tx<{ email: string }[]>`select email from members where company_id = ${id} and role in ('owner','manager') and status <> 'archived' and email is not null`);
    const { subject, text } = summaryText(w);
    for (const m of managers) await sendEmail({ to: m.email, subject, text });
    sent++;
  }
  return sent;
}

export async function weeklySummaryOn(companyId: string): Promise<boolean> {
  const [c] = await system((tx) => tx<{ weeklySummary: boolean }[]>`select weekly_summary from companies where id = ${companyId}`);
  return c?.weeklySummary ?? false;
}
