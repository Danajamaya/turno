import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Lightbulb, CheckCircle2, Circle, Clock, Coins, HandCoins, MapPin, Ticket, Users } from "lucide-react";
import { addLocalDays, localDate, localRange, weekStartOf } from "@turno/core";
import { BarList, StackedColumns } from "@/components/charts";
import { DayTimeline } from "@/components/day-timeline";
import { TourCover } from "@/components/postcard";
import { channelColour } from "@/components/channel";
import { ButtonLink, Card, EmptyState, Kpi } from "@/components/ui";
import { dayLabel, hm, money, moneyWhole } from "@/lib/format";
import { calendar, channels, guideIncome, platformName, recentBookings, reviewQueue, type CalendarBooking } from "@/lib/guides";
import { listTours } from "@/lib/marketplace";
import { overbookings } from "@/lib/waitlist";
import { demandIdeas } from "@/lib/demand";
import { forecast, rainAlerts } from "@/lib/weather";
import { getProfile } from "@/lib/marketplace";
import { closeDepartureAction } from "@/app/growth-actions";
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
  const [todayList, upcoming, history, month, prev, chans, review, recent, tourList, over, ideas] = await Promise.all([
    calendar(s, localRange(today, 1, tz).start, localRange(today, 1, tz).end),
    calendar(s, now, new Date(now.getTime() + 14 * 86_400_000)),
    calendar(s, localRange(firstWeek, 7 * 12, tz).start, localRange(firstWeek, 7 * 12, tz).end),
    guideIncome(s, firstOfMonth(ym), firstOfMonth(ym, 1)),
    // month to date against the same days of last month, not the whole month
    guideIncome(s, firstOfMonth(ym, -1), new Date(Math.min(firstOfMonth(ym).getTime(), firstOfMonth(ym, -1).getTime() + (now.getTime() - firstOfMonth(ym).getTime())))),
    channels(s), reviewQueue(s), recentBookings(s), listTours(s), overbookings(s, now, new Date(now.getTime() + 21 * 86_400_000)), demandIdeas(s),
  ]);
  const todays = groupTours(todayList);
  const next = groupTours(upcoming)[0];
  const minutes = next ? Math.round((new Date(next.startsAt).getTime() - now.getTime()) / 60_000) : 0;
  const weeks = Array.from({ length: 12 }, (_, i) => addLocalDays(firstWeek, i * 7));
  const live = history.filter((b) => b.status !== "cancelled");
  const weekOf = (b: CalendarBooking) => weekStartOf(localDate(new Date(b.startsAt), tz), s.location.weekStartDay);
  const platforms = [...new Set(live.map((b) => b.platform))].sort((a, b) => live.filter((x) => x.platform === b).length - live.filter((x) => x.platform === a).length);
  const weekSeries = platforms.map((pl) => ({ name: platformName[pl] ?? pl, colour: channelColour(pl), values: weeks.map((w) => live.filter((b) => b.platform === pl && weekOf(b) === w).reduce((n, b) => n + b.people, 0)) }));
  const byTitle = new Map(tourList.map((x) => [x.title, x]));
  const hourOf = (iso: string) => { const [h, m] = hm(iso, tz).split(":").map(Number); return h + m / 60; };
  const timeline = todays.map((g) => ({ key: g.key, start: hourOf(g.startsAt), time: hm(g.startsAt, tz), durationMin: byTitle.get(g.tourName)?.durationMin ?? 120, tourName: g.tourName, people: g.people,
    capacity: byTitle.get(g.tourName)?.capacity ?? null, byPlatform: [...g.byPlatform].sort((a, b) => b[1] - a[1]), href: `/calendario?semana=${today}` }));
  const nowH = hourOf(now.toISOString());
  const profile = await getProfile(s);
  const soon = groupTours(upcoming).filter((g) => new Date(g.startsAt).getTime() < now.getTime() + 36 * 3600_000);
  const rain = rainAlerts(await forecast(profile?.city || s.location.name), soon.map((g) => ({ startsAt: g.startsAt, tourName: g.tourName, durationMin: byTitle.get(g.tourName)?.durationMin ?? 120 })));
  const wkLabel = (d: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const t = month.total, p = prev.total;
  const trend = (a: number, b: number) => { const v = pct(a, b); return v === null ? undefined : { text: `${Math.abs(v)} %`, up: v >= 0 }; };
  const connected = new Set(chans.filter((c) => c.lastEventAt).map((c) => c.platform)).size;
  const first = s.member.fullName.split(" ")[0];
  const until = minutes < 60 ? `en ${minutes} min` : minutes < 24 * 60 ? `en ${Math.round(minutes / 60)} h` : dayLabel(localDate(new Date(next!.startsAt), tz));

  const totalToday = todays.reduce((n, g) => n + g.people, 0);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl md:text-display">Hola, {first}</h1>
          <p className="text-text-muted first-letter:uppercase">{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now)}</p>
        </div>
        <ButtonLink href="/calendario" variant="secondary"><CalendarDays aria-hidden size={16} /> Ver la semana</ButtonLink>
      </div>

      {over.length > 0 && (
        <section className="rounded-lg border border-danger bg-danger-soft p-5" aria-labelledby="over-h">
          <h2 id="over-h" className="flex items-center gap-2 text-lg text-danger"><AlertTriangle aria-hidden size={20} /> {over.length === 1 ? "Una salida tiene sobreventa" : `${over.length} salidas tienen sobreventa`}</h2>
          <p className="mb-3 text-sm">Sumando todas tus plataformas, se vendieron más plazas de las que tiene el tour. Ciérrala en las plataformas que todavía la venden o súbele el cupo.</p>
          <ul className="grid gap-2">
            {over.map((o) => (
              <li key={o.tourId + o.startsAt} className="flex flex-wrap items-center gap-3 rounded-md bg-bg px-4 py-3 text-sm">
                <span className="min-w-0 flex-1"><b>{o.tourName}</b>, {dayLabel(localDate(new Date(o.startsAt), tz))} {hm(o.startsAt, tz)}
                  <span className="block text-text-muted"><b className="tnum text-danger">{o.people} personas para {o.capacity} plazas</b>, de {o.platforms.map((x) => platformName[x] ?? x).join(", ")}</span></span>
                <form action={closeDepartureAction}>
                  <input type="hidden" name="tourId" value={o.tourId} /><input type="hidden" name="startsAt" value={o.startsAt} /><input type="hidden" name="closed" value={o.closed ? "0" : "1"} />
                  <button className="rounded-md border border-border-input bg-bg px-3 py-2 font-semibold hover:border-text">{o.closed ? "Volver a vender en Turno" : "Dejar de vender en Turno"}</button>
                </form>
                <Link href={`/calendario?semana=${localDate(new Date(o.startsAt), tz)}`} className="font-semibold underline">Ver el grupo</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rain.length > 0 && (
        <section className="rounded-lg border border-info bg-info-soft p-5" aria-labelledby="rain-h">
          <h2 id="rain-h" className="text-lg text-info">🌧 Lluvia prevista en {rain.length === 1 ? "un tour" : `${rain.length} tours`}</h2>
          <ul className="mt-2 grid gap-1 text-sm">{rain.map((r) => <li key={r.startsAt + r.tourName}><b>{dayLabel(localDate(new Date(r.startsAt), tz))} {hm(r.startsAt, tz)}</b> {r.tourName}: {r.rainChance} % de probabilidad</li>)}</ul>
          <p className="mt-2 text-sm">Avisa a los grupos de que traigan paraguas desde <Link href="/mensajes" className="font-semibold underline">Mensajes</Link> o el chat del equipo.</p>
        </section>
      )}

      <Card className="p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">Tu día</h2>
          <p className="tnum text-sm text-text-muted">{todays.length} {todays.length === 1 ? "tour" : "tours"} y {totalToday} personas, de todas tus plataformas</p>
        </div>
        {todays.length === 0
          ? <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-text-muted">Hoy no tienes tours. Las reservas nuevas aparecen aquí en cuanto llegan.</p>
          : <div className="overflow-x-auto pb-1" tabIndex={0} role="region" aria-label="Línea de tiempo de hoy"><div className="min-w-[640px]"><DayTimeline tours={timeline} nowHours={nowH} label="Tours de hoy por hora" /></div></div>}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Reservas este mes" value={t.bookings.toLocaleString("es-ES")} trend={trend(t.bookings, p.bookings)} edge="border-t-ch-viator" icon={<Ticket aria-hidden size={16} />} />
        <Kpi label="Personas" value={t.people.toLocaleString("es-ES")} trend={trend(t.people, p.people)} edge="border-t-ch-guruwalk" icon={<Users aria-hidden size={16} />} />
        <Kpi label="Te quedó" value={moneyWhole(t.netCents, cur)} trend={trend(t.netCents, p.netCents)} edge="border-t-gold" icon={<Coins aria-hidden size={16} />} />
        <Kpi label="Propinas" value={moneyWhole(t.tipsCents, cur)} trend={trend(t.tipsCents, p.tipsCents)} edge="border-t-ch-strawberry" icon={<HandCoins aria-hidden size={16} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {next ? (
          <section className="overflow-hidden rounded-lg bg-side-a text-on-side shadow-card">
            <div className="relative h-40">
              <TourCover title={next.tourName} time={hm(next.startsAt, tz)} rounded={false} />
              <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-pill bg-bg px-3 py-1 text-xs font-semibold text-text shadow-card"><Clock aria-hidden size={13} /> Tu próximo tour, {until}</span>
            </div>
            <div className="p-5">
              <p className="flex items-baseline gap-3"><span className="tnum font-serif text-display leading-none">{hm(next.startsAt, tz)}</span><span className="min-w-0 truncate text-lg">{next.tourName}</span></p>
              <p className="mt-3 flex flex-wrap gap-4 text-sm text-side-text">
                <span className="inline-flex items-center gap-1.5"><Users aria-hidden size={16} /> {next.people} personas</span>
                <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={16} /> {s.location.name}</span>
              </p>
              <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-pill" role="img" aria-label={"De dónde viene tu grupo: " + [...next.byPlatform].map(([k, v]) => `${platformName[k]} ${v}`).join(", ")}>
                {[...next.byPlatform].map(([k, v]) => <span key={k} className={`bg-${channelColour(k)}`} style={{ flex: v }} />)}
              </div>
              <p className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
                {[...next.byPlatform].map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-2.5 w-2.5 rounded-sm bg-${channelColour(k)}`} />{platformName[k]} {v}</span>)}
              </p>
              <ButtonLink href={`/calendario?semana=${localDate(new Date(next.startsAt), tz)}`} variant="secondary" className="mt-5 border-gold bg-gold text-on-gold hover:bg-gold">Ver la lista del grupo</ButtonLink>
            </div>
          </section>
        ) : (
          <Card><EmptyState title="No tienes tours en los próximos 14 días" body="Conecta tus plataformas para que tus reservas lleguen solas." action={<ButtonLink href="/canales" variant="primary">Conectar plataformas</ButtonLink>} /></Card>
        )}
        <Card className="p-5">
          <h2 className="text-lg">Personas por semana</h2>
          <p className="mb-3 text-sm text-text-muted">Últimas 12 semanas, por plataforma</p>
          <StackedColumns labels={weeks.map(wkLabel)} series={weekSeries} format={(v) => Math.round(v).toLocaleString("es-ES")} label="Personas por semana y plataforma" col="Semana" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg">Te quedó por plataforma</h2>
          <p className="mb-3 text-sm text-text-muted">Este mes, después de comisiones y con propinas</p>
          {month.rows.length === 0 ? <p className="text-sm text-text-muted">Todavía no hay reservas este mes.</p> : (
            <BarList rows={month.rows.map((r) => ({ label: platformName[r.platform] ?? r.platform, value: r.netCents, colour: channelColour(r.platform) }))} format={(v) => moneyWhole(v, cur)} label="Te quedó" col="Plataforma" />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-lg">Últimas reservas recibidas</h2>
          <p className="mb-3 text-sm text-text-muted">Llegan solas desde tus plataformas</p>
          {recent.length === 0 ? <p className="text-sm text-text-muted">Todavía no llegó ninguna.</p> : (
            <ul className="divide-y divide-border">
              {recent.slice(0, 6).map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span aria-hidden className={`h-8 w-1 shrink-0 rounded-pill bg-${channelColour(b.platform)}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{b.travellerName || b.tourName || "Reserva"}</span>
                    <span className="block truncate text-xs text-text-muted">{platformName[b.platform] ?? b.platform}, {b.people} {b.people === 1 ? "persona" : "personas"}, {dayLabel(localDate(new Date(b.startsAt), tz))} {hm(b.startsAt, tz)}</span>
                  </span>
                  {b.status === "cancelled" ? <span className="text-xs font-semibold text-danger">Cancelada</span> : b.grossCents > 0 && <span className="tnum font-semibold">{money(b.grossCents, cur)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

        {ideas.length > 0 && (
          <Card className="mb-6 p-5">
            <h2 className="flex items-center gap-2 text-lg"><Lightbulb aria-hidden size={20} className="text-gold-ink" /> Ideas para vender más</h2>
            <p className="mb-3 text-sm text-text-muted">Según cómo se llenaron tus salidas las últimas 8 semanas, sumando todas las plataformas.</p>
            <ul className="grid gap-3 md:grid-cols-3">
              {ideas.slice(0, 3).map((a) => {
                const when = `${["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"][a.weekday]} a las ${a.time}`;
                const pct = `${Math.round(a.fill * 100)} %`;
                const text = a.kind === "raise_price" ? `Se llena casi siempre (${pct} de media). Prueba a subirlo a ${money(a.suggestedPriceCents!, cur)}.`
                  : a.kind === "add_departure" ? `Va al ${pct} de media. Añade otra salida ese día para no perder gente.`
                  : a.kind === "launch_price" ? `Solo se llena al ${pct}. Prueba un precio de lanzamiento de ${money(a.suggestedPriceCents!, cur)}.`
                  : `Solo se llena al ${pct}. Muévelo a otra hora o quítalo y junta a la gente en otra salida.`;
                return (
                  <li key={a.tourId + a.weekday + a.time} className="rounded-md bg-surface p-4 text-sm">
                    <b className="block">{a.tourName}</b><span className="text-text-muted">{when}</span>
                    <p className="mt-2">{text}</p>
                    <Link href={`/perfil?editar=${a.tourId}`} className="mt-2 inline-block font-semibold text-accent underline">Cambiar el tour</Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <Card className="p-5">
          <h2 className="text-lg">Para tenerlo todo al día</h2>
          <p className="mb-3 text-sm text-text-muted">Lo que falta para que Turno trabaje solo</p>
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              { done: connected >= 3, text: `Plataformas que ya mandan reservas: ${connected} de 6`, href: "/canales" },
              { done: review.length === 0, text: review.length ? `${review.length} correos por revisar` : "Sin correos por revisar", href: "/canales" },
              { done: chans.some((c) => c.feePerPersonCents > 0), text: "Lo que te cobra cada plataforma", href: "/canales" },
              { done: false, text: "Sube tu video de presentación", href: "/perfil" },
            ].map((it) => (
              <li key={it.text}><Link href={it.href} className="flex items-center gap-3 py-3 hover:text-accent">
                {it.done ? <CheckCircle2 aria-label="Hecho" className="shrink-0 text-success" size={20} /> : <Circle aria-label="Pendiente" className="shrink-0 text-text-muted" size={20} />}{it.text}</Link></li>
            ))}
          </ul>
        </Card>
    </div>
  );
}
