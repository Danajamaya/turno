import type { Metadata } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addLocalDays, localDate, localRange, weekDays, weekStartOf } from "@turno/core";
import { closeBookingAction } from "@/app/actions";
import { ChannelBadge } from "@/components/channel";
import { Badge, Button, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { dayLabel, hm, money, rangeLabel } from "@/lib/format";
import { calendar } from "@/lib/guides";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Calendario" };

const statusTone = { confirmed: "invited", cancelled: "denied", attended: "approved", no_show: "pending" } as const;
const statusName = { confirmed: "Confirmada", cancelled: "Cancelada", attended: "Asistió", no_show: "No vino" } as const;

// G06 unified calendar: every booking from every channel, by day.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const tz = s.location.timezone;
  const q = await searchParams;
  const today = localDate(new Date(), tz);
  const week = weekStartOf(q.semana && /^\d{4}-\d{2}-\d{2}$/.test(q.semana) ? q.semana : today, s.location.weekStartDay);
  const days = weekDays(week);
  const { start, end } = localRange(week, 7, tz);
  const list = await calendar(s, start, end);
  const live = list.filter((b) => b.status !== "cancelled");
  return (
    <>
      <PageHeader title="Calendario">
        <div className="flex items-center gap-1">
          <ButtonLink href={`/calendario?semana=${addLocalDays(week, -7)}`} variant="ghost" size="sm" aria-label="Semana anterior"><ChevronLeft aria-hidden size={18} /></ButtonLink>
          <span className="tnum min-w-36 text-center text-sm font-semibold">{rangeLabel(days[0], days[6])}</span>
          <ButtonLink href={`/calendario?semana=${addLocalDays(week, 7)}`} variant="ghost" size="sm" aria-label="Semana siguiente"><ChevronRight aria-hidden size={18} /></ButtonLink>
        </div>
        <ButtonLink href="/canales" variant="secondary">Conectar plataformas</ButtonLink>
      </PageHeader>
      <p className="tnum mb-4 text-sm text-text-muted">{live.length} reservas · {live.reduce((n, b) => n + b.people, 0)} personas esta semana</p>
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
