import type { Metadata } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addLocalDays, localDate, localRange, localTime, weekDays, weekStartOf } from "@turno/core";
import { closeBookingAction } from "@/app/actions";
import { ChannelBadge } from "@/components/channel";
import { WeekGrid } from "@/components/week-grid";
import { PLATFORMS } from "@/lib/guides";
import { Badge, Banner, Button, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { autoAssignAction } from "@/app/growth-actions";
import { dayLabel, hm, money, rangeLabel } from "@/lib/format";
import { calendar } from "@/lib/guides";
import { tourGroups } from "@/lib/guide-app";
import { listMembers } from "@/lib/store";
import { assignGuideAction } from "@/app/actions";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Calendario" };

const statusTone = { confirmed: "invited", cancelled: "denied", attended: "approved", no_show: "pending" } as const;
const statusName = { confirmed: "Confirmada", cancelled: "Cancelada", attended: "Asistió", no_show: "No vino" } as const;

// G06 unified calendar: every booking from every channel, by day.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ semana?: string; repartidos?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const tz = s.location.timezone;
  const q = await searchParams;
  const today = localDate(new Date(), tz);
  const week = weekStartOf(q.semana && /^\d{4}-\d{2}-\d{2}$/.test(q.semana) ? q.semana : today, s.location.weekStartDay);
  const days = weekDays(week);
  const { start, end } = localRange(week, 7, tz);
  const [list, groups, people] = await Promise.all([calendar(s, start, end), tourGroups(s, start, end), listMembers(s)]);
  const live = list.filter((b) => b.status !== "cancelled");
  return (
    <>
      <PageHeader title="Calendario">
        <div className="flex items-center gap-1">
          <ButtonLink href={`/calendario?semana=${addLocalDays(week, -7)}`} variant="ghost" size="sm" aria-label="Semana anterior"><ChevronLeft aria-hidden size={18} /></ButtonLink>
          <span className="tnum min-w-36 text-center text-sm font-semibold">{rangeLabel(days[0], days[6])}</span>
          <ButtonLink href={`/calendario?semana=${addLocalDays(week, 7)}`} variant="ghost" size="sm" aria-label="Semana siguiente"><ChevronRight aria-hidden size={18} /></ButtonLink>
        </div>
        <form action={autoAssignAction}><Button variant="secondary">Asignar guías (7 días)</Button></form>
        <ButtonLink href="/calendario/sincronizar" variant="secondary">Sincronizar con mi calendario</ButtonLink>
        <ButtonLink href="/canales" variant="secondary">Conectar plataformas</ButtonLink>
      </PageHeader>
      {q.repartidos !== undefined && <div className="mb-4"><Banner tone={q.repartidos === "0" ? "info" : "success"} role="status">{q.repartidos === "0" ? "No había tours sin guía, o nadie estaba libre. Revisa los idiomas y pagos en «Pagos a guías»." : `${q.repartidos} ${q.repartidos === "1" ? "tour asignado" : "tours asignados"}. Cada guía ya los ve en su app.`}</Banner></div>}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="tnum rounded-pill bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">{live.length} reservas · {live.reduce((n, b) => n + b.people, 0)} personas</span>
        {PLATFORMS.map((p) => <ChannelBadge key={p} platform={p} />)}
      </div>
      {list.length > 0 && (() => {
        const [hh, mm] = localTime(new Date(), tz).split(":").map(Number);
        return <div className="mb-6"><WeekGrid days={days} list={list} tz={tz} today={today} nowHours={hh + mm / 60} /></div>;
      })()}
      {groups.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="font-serif text-lg">Guía de cada tour</h2>
          <p className="mb-3 text-sm text-text-muted">El guía asignado ve el tour en su teléfono, pasa lista y lo cierra con las propinas.</p>
          <ul className="divide-y divide-border">
            {groups.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="tnum w-28 text-text-muted">{dayLabel(localDate(new Date(g.startsAt), tz))} · {hm(g.startsAt, tz)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{g.tourName}</span>
                <span className="tnum text-text-muted">{g.people} p.</span>
                <form action={assignGuideAction} className="flex items-center gap-2">
                  <input type="hidden" name="key" value={g.key} />
                  <label className="sr-only" htmlFor={`g-${g.key}`}>Guía de {g.tourName}</label>
                  <select id={`g-${g.key}`} name="memberId" defaultValue={g.guideMemberId ?? ""} className="h-9 rounded-md border border-border-input bg-bg px-2 text-sm">
                    <option value="">Sin guía</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                  <Button size="sm" variant="secondary">Asignar</Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {list.length > 0 && <h2 className="mb-3 font-serif text-lg">Detalle de la semana</h2>}
      {list.length === 0 ? (
        <Card><EmptyState title="No hay reservas esta semana" body="Conecta tus plataformas y las reservas de GuruWalk, Freetour, Strawberry, GetYourGuide, Viator y Civitatis aparecen aquí solas." action={<ButtonLink href="/canales" variant="primary">Conectar plataformas</ButtonLink>} /></Card>
      ) : (
        <div className="grid gap-4">
          {days.map((d) => {
            const items = list.filter((b) => localDate(new Date(b.startsAt), tz) === d);
            if (items.length === 0) return null;
            return (
              <Card key={d} className="p-4">
                <h2 className={`mb-3 text-lg ${d === today ? "text-accent" : ""}`}>{dayLabel(d)}</h2>
                <ul className="divide-y divide-border">
                  {items.map((b) => {
                    const past = new Date(b.startsAt) < new Date();
                    return (
                      <li key={b.id} className={`flex flex-wrap items-center gap-3 py-3 text-sm ${b.status === "cancelled" ? "opacity-60" : ""}`}>
                        <span className="tnum w-14 font-semibold">{hm(b.startsAt, tz)}</span>
                        <ChannelBadge platform={b.platform} />
                        <span className="mr-auto min-w-0">
                          <span className="block truncate font-semibold">{b.tourName ?? "Tour"}</span>
                          <span className="block text-xs text-text-muted">{b.travellerName || "Sin nombre"}{b.travellerPhone ? ` · ${b.travellerPhone}` : ""} · ref. {b.externalRef}</span>
                        </span>
                        <span className="tnum">{b.people} {b.people === 1 ? "persona" : "personas"}</span>
                        {b.grossCents > 0 && <span className="tnum text-text-muted">{money(b.grossCents, b.currency)}</span>}
                        <Badge tone={statusTone[b.status as keyof typeof statusTone]}>{statusName[b.status as keyof typeof statusName]}</Badge>
                        {past && b.status === "confirmed" && (
                          <form action={closeBookingAction} className="flex items-center gap-2">
                            <input type="hidden" name="bookingId" value={b.id} />
                            <label className="text-xs text-text-muted" htmlFor={`tips-${b.id}`}>Propinas €</label>
                            <input id={`tips-${b.id}`} name="tips" inputMode="decimal" className="tnum h-8 w-20 rounded-md border border-border-input bg-bg px-2" />
                            <Button size="sm" name="attended" value="yes">Cerrar</Button>
                            <Button size="sm" variant="ghost" name="attended" value="no">No vino</Button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
