import type { Metadata } from "next";
import Link from "next/link";
import { localDate, localRange } from "@turno/core";
import { signOutAction } from "@/app/actions";
import { Card, EmptyState } from "@/components/ui";
import { dayLabel, hm } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { myPublishedShifts, openCard } from "@/lib/store";
import { myTours } from "@/lib/guide-app";
import { openSwaps } from "@/lib/ops";
import { takeSwapAction } from "@/app/pro-actions";
import { ChannelBadge } from "@/components/channel";
import { ClockPanel } from "./clock-panel";

export const metadata: Metadata = { title: "Checar" };
export const dynamic = "force-dynamic";

// S16 clock in/out + S15 my upcoming shifts. Phone-first; managers can use it too.
export default async function ClockPage({ searchParams }: { searchParams: Promise<{ cambio?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  const tz = s.location.timezone;
  const today = localDate(new Date(), tz);
  const { start } = localRange(today, 1, tz);
  const { end } = localRange(today, 14, tz);
  const [card, shifts, tours, swaps] = await Promise.all([openCard(s), myPublishedShifts(s, start, end), myTours(s, start, localRange(today, 1, tz).end), openSwaps(s)]);
  const takeable = swaps.filter((w) => w.fromMemberId !== s.member.id);
  const swapMsg: Record<string, string> = { pedido: "Pedido. Le avisamos al equipo; te contamos cuando alguien lo coja.", hecho: "¡Listo! El tour ya es tuyo y lo ves en tu día.", busy: "No puedes cogerlo: ya llevas un tour a esa hora.", gone: "Ese cambio ya lo cogió otra persona." };
  const todays = shifts.filter((x) => localDate(new Date(x.startAt), tz) === today);
  const first = s.member.fullName.split(" ")[0];

  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg">Hola, {first}</h1>
          <p className="text-xs text-text-muted">{s.location.name} · {s.company.name}</p>
        </div>
        {s.member.role !== "employee" && <Link href="/schedule" className="text-sm text-accent underline">Panel</Link>}
        <Link href="/equipo" className="text-sm text-accent underline">Equipo</Link>
        <Link href="/account" className="text-sm text-accent underline">Cuenta</Link>
        <form action={signOutAction}><button className="text-sm text-accent underline">Salir</button></form>
      </header>

      {q.cambio && swapMsg[q.cambio] && <p role="status" className={`rounded-md px-4 py-3 text-sm ${q.cambio === "busy" || q.cambio === "gone" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>{swapMsg[q.cambio]}</p>}
      {takeable.length > 0 && (
        <Card className="p-4">
          <h2 className="text-lg">Tours que buscan guía</h2>
          <ul className="mt-2 divide-y divide-border text-sm">{takeable.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1"><b className="first-letter:uppercase">{new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(w.startsAt))}</b> {w.tourName}
                <span className="block text-xs text-text-muted">De {w.fromName}{w.note ? `: ${w.note}` : ""}</span></span>
              <form action={takeSwapAction}><input type="hidden" name="id" value={w.id} /><button className="rounded-md bg-accent px-3 py-2 font-semibold text-on-accent">Lo cojo</button></form>
            </li>))}</ul>
        </Card>
      )}
      <Card>
        <p className="text-sm text-text-muted">
          {todays.length ? <>Hoy {todays.map((x) => `${hm(x.startAt, tz)}–${hm(x.endAt, tz)}`).join(", ")} · {todays[0].jobTitle ?? "Turno"}</> : "Hoy no tienes turno programado."}
        </p>
        <ClockPanel clockedInAt={card?.clockInAt ?? null} tz={tz} />
      </Card>

      {tours.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg">Mis tours de hoy</h2>
          <ul className="divide-y divide-border">
            {tours.map((t) => (
              <li key={t.key}><Link href={`/clock/tour?k=${encodeURIComponent(t.key)}`} className="flex items-center gap-3 py-3 text-sm">
                <span className="tnum w-12 font-bold">{hm(t.startsAt, tz)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{t.tourName}</span><span className="flex flex-wrap gap-2">{t.platforms.map((p) => <ChannelBadge key={p} platform={p} />)}</span></span>
                <span className="tnum font-bold">{t.people}</span><span className="text-accent">Pasar lista ›</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg">Mis próximos turnos</h2>
        {shifts.length === 0 ? (
          <EmptyState title="No tienes turnos publicados" body="Cuando tu gerente publique el horario, aparecerá aquí." />
        ) : (
          <ul className="divide-y divide-border">
            {shifts.map((x) => {
              const d = localDate(new Date(x.startAt), tz);
              return (
                <li key={x.id} className="tnum flex items-center gap-3 py-3 text-sm">
                  <span className={`w-20 font-semibold ${d === today ? "text-accent" : ""}`}>{d === today ? "Hoy" : dayLabel(d)}</span>
                  <span className="mr-auto">{hm(x.startAt, tz)} – {hm(x.endAt, tz)}</span>
                  <span className="text-text-muted">{x.jobTitle ?? ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </main>
  );
}
