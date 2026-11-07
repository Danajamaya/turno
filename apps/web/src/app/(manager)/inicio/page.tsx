import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, Clock, MapPin, Users } from "lucide-react";
import { addLocalDays, localDate, localRange, weekStartOf } from "@turno/core";
import { BarList, LineChart } from "@/components/charts";
import { ChannelBadge, channelColour } from "@/components/channel";
import { ButtonLink, Card, EmptyState, Kpi } from "@/components/ui";
import { dayLabel, hm, money, moneyWhole } from "@/lib/format";
import { calendar, channels, guideIncome, platformName, recentBookings, reviewQueue, type CalendarBooking } from "@/lib/guides";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Inicio" };
export const dynamic = "force-dynamic";

interface TourGroup { key: string; startsAt: string; tourName: string; people: number; byPlatform: Map<string, number> }

function groupTours(list: CalendarBooking[]): TourGroup[] {
  const by = new Map<string, TourGroup>();
  for (const b of list) {
    if (b.status === "cancelled") continue;
    const key = `${b.startsAt}|${b.tourName ?? ""}`;
    const g = by.get(key) ?? { key, startsAt: b.startsAt, tourName: b.tourName ?? "Tour", people: 0, byPlatform: new Map() };
    g.people += b.people;
    g.byPlatform.set(b.platform, (g.byPlatform.get(b.platform) ?? 0) + b.people);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

const pct = (now: number, before: number) => (before === 0 ? null : Math.round(((now - before) / before) * 100));
const firstOfMonth = (ym: string, add = 0) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + add, 1)); };

// Home for the guide or operator: what is next, today, and how the month goes.
export default async function HomePage() {
  const s = await requireSession(["owner", "manager"]);
  const tz = s.location.timezone, cur = s.company.currency;
  const now = new Date(), today = localDate(now, tz), ym = today.slice(0, 7);
  const thisWeek = weekStartOf(today, s.location.weekStartDay), firstWeek = addLocalDays(thisWeek, -11 * 7);
  const [todayList, upcoming, history, month, prev, chans, review, recent] = await Promise.all([
    calendar(s, localRange(today, 1, tz).start, localRange(today, 1, tz).end),
    calendar(s, now, new Date(now.getTime() + 14 * 86_400_000)),
    calendar(s, localRange(firstWeek, 7 * 12, tz).start, localRange(firstWeek, 7 * 12, tz).end),
    guideIncome(s, firstOfMonth(ym), firstOfMonth(ym, 1)),
    // month to date against the same days of last month, not the whole month
    guideIncome(s, firstOfMonth(ym, -1), new Date(Math.min(firstOfMonth(ym).getTime(), firstOfMonth(ym, -1).getTime() + (now.getTime() - firstOfMonth(ym).getTime())))),
    channels(s), reviewQueue(s), recentBookings(s),
  ]);
  const todays = groupTours(todayList);
  const next = groupTours(upcoming)[0];
  const minutes = next ? Math.round((new Date(next.startsAt).getTime() - now.getTime()) / 60_000) : 0;
  const weeks = Array.from({ length: 12 }, (_, i) => addLocalDays(firstWeek, i * 7));
  const perWeek = weeks.map((w) => history.filter((b) => b.status !== "cancelled" && weekStartOf(localDate(new Date(b.startsAt), tz), s.location.weekStartDay) === w).reduce((n, b) => n + b.people, 0));
  const wkLabel = (d: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const t = month.total, p = prev.total;
  const trend = (a: number, b: number) => { const v = pct(a, b); return v === null ? undefined : { text: `${Math.abs(v)} %`, up: v >= 0 }; };
  const connected = new Set(chans.filter((c) => c.lastEventAt).map((c) => c.platform)).size;
  const first = s.member.fullName.split(" ")[0];
  const until = minutes < 60 ? `en ${minutes} min` : minutes < 24 * 60 ? `en ${Math.round(minutes / 60)} h` : dayLabel(localDate(new Date(next!.startsAt), tz));

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-serif text-xl">Hola, {first}</h1>
        <p className="text-text-muted">{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now)} · todas tus plataformas en un lugar</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {next ? (
          <section className="relative overflow-hidden rounded-lg bg-gradient-to-br from-side-a to-side-b p-6 text-on-side shadow-card">
            <span aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-pill border-[28px] border-gold opacity-20" />
            <div className="relative">
              <p className="flex items-center gap-2 text-sm text-side-text"><Clock aria-hidden size={16} /> Tu próximo tour · {until}</p>
              <p className="tnum mt-2 font-serif text-display leading-none">{hm(next.startsAt, tz)}</p>
              <h2 className="mt-2 text-lg">{next.tourName}</h2>
              <p className="mt-3 flex flex-wrap gap-4 text-sm text-side-text">
                <span className="inline-flex items-center gap-1.5"><Users aria-hidden size={16} /> {next.people} personas</span>
                <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={16} /> {s.location.name}</span>
              </p>
              <p className="mt-4 text-sm text-side-text">De dónde viene tu grupo</p>
              <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-pill" role="img" aria-label={[...next.byPlatform].map(([k, v]) => `${platformName[k]} ${v}`).join(", ")}>
                {[...next.byPlatform].map(([k, v]) => <span key={k} className={`bg-${channelColour(k)}`} style={{ flex: v }} />)}
              </div>
              <p className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
                {[...next.byPlatform].map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-2.5 w-2.5 rounded-sm bg-${channelColour(k)}`} />{platformName[k]} {v}</span>)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <ButtonLink href={`/calendario?semana=${localDate(new Date(next.startsAt), tz)}`} variant="secondary" className="border-gold bg-gold text-on-gold hover:bg-gold">Ver la lista del grupo</ButtonLink>
              </div>
            </div>
          </section>
        ) : (
          <Card><EmptyState title="No tienes tours en los próximos 14 días" body="Conecta tus plataformas para que tus reservas lleguen solas." action={<ButtonLink href="/canales" variant="primary">Conectar plataformas</ButtonLink>} /></Card>
        )}
        <Card className="p-5">
          <h2 className="text-lg">Para hoy</h2>
          <p className="mb-3 text-sm text-text-muted">{todays.length} {todays.length === 1 ? "tour" : "tours"} · {todays.reduce((n, g) => n + g.people, 0)} personas</p>
          {todays.length === 0 ? <p className="text-sm text-text-muted">Hoy no tienes tours.</p> : (
            <ul className="divide-y divide-border">
              {todays.map((g) => (
                <li key={g.key} className="flex items-center gap-3 py-3 text-sm">
                  <span className="tnum w-12 font-bold">{hm(g.startsAt, tz)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{g.tourName}</span><span className="flex flex-wrap gap-3">{[...g.byPlatform.keys()].map((k) => <ChannelBadge key={k} platform={k} />)}</span></span>
                  <span className="tnum font-bold">{g.people}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Reservas este mes" value={t.bookings.toLocaleString("es-ES")} trend={trend(t.bookings, p.bookings)} edge="border-t-ch-viator" />
        <Kpi label="Personas" value={t.people.toLocaleString("es-ES")} trend={trend(t.people, p.people)} edge="border-t-ch-guruwalk" />
        <Kpi label="Te quedó" value={moneyWhole(t.netCents, cur)} trend={trend(t.netCents, p.netCents)} edge="border-t-gold" />
        <Kpi label="Propinas" value={moneyWhole(t.tipsCents, cur)} trend={trend(t.tipsCents, p.tipsCents)} edge="border-t-ch-strawberry" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-lg">Personas por semana</h2>
          <p className="mb-3 text-sm text-text-muted">Últimas 12 semanas, todas las plataformas</p>
          <LineChart labels={weeks.map(wkLabel)} values={perWeek} format={(v) => `${Math.round(v).toLocaleString("es-ES")} personas`} label="Personas" />
        </Card>
        <Card className="p-5">
          <h2 className="text-lg">Para tenerlo todo al día</h2>
          <p className="mb-3 text-sm text-text-muted">Lo que falta para que Turno trabaje solo</p>
          <ul className="divide-y divide-border text-sm">
            {[
              { done: connected >= 3, text: `Plataformas que ya mandan reservas: ${connected} de 6`, href: "/canales" },
              { done: review.length === 0, text: review.length ? `${review.length} correos por revisar` : "Sin correos por revisar", href: "/canales" },
              { done: chans.some((c) => c.feePerPersonCents > 0), text: "Lo que te cobra cada plataforma", href: "/canales" },
              { done: false, text: "Sube tu video de presentación (pronto)", href: "/settings" },
            ].map((it) => (
              <li key={it.text}><Link href={it.href} className="flex items-center gap-3 py-3 hover:text-accent">
                {it.done ? <CheckCircle2 aria-label="Hecho" className="shrink-0 text-success" size={20} /> : <Circle aria-label="Pendiente" className="shrink-0 text-text-muted" size={20} />}{it.text}</Link></li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg">Te quedó por plataforma</h2>
          <p className="mb-3 text-sm text-text-muted">Este mes · después de comisiones, con propinas</p>
          {month.rows.length === 0 ? <p className="text-sm text-text-muted">Todavía no hay reservas este mes.</p> : (
            <BarList rows={month.rows.map((r) => ({ label: platformName[r.platform] ?? r.platform, value: r.netCents, colour: channelColour(r.platform) }))} format={(v) => moneyWhole(v, cur)} label="Te quedó" col="Plataforma" />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-lg">Últimas reservas recibidas</h2>
          <p className="mb-3 text-sm text-text-muted">Llegan solas desde tus plataformas</p>
          {recent.length === 0 ? <p className="text-sm text-text-muted">Todavía no llegó ninguna.</p> : (
            <ul className="divide-y divide-border">
              {recent.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.travellerName || b.tourName || "Reserva"} · {b.people} {b.people === 1 ? "persona" : "personas"}</span>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-text-muted"><ChannelBadge platform={b.platform} />{b.tourName ?? "Tour"} · {dayLabel(localDate(new Date(b.startsAt), tz))} {hm(b.startsAt, tz)}</span>
                  </span>
                  {b.grossCents > 0 && <span className="tnum font-semibold">{money(b.grossCents, cur)}</span>}
                  {b.status === "cancelled" && <span className="text-xs font-semibold text-danger">Cancelada</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
