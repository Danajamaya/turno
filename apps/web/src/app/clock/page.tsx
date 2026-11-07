import type { Metadata } from "next";
import Link from "next/link";
import { localDate, localRange } from "@turno/core";
import { signOutAction } from "@/app/actions";
import { Card, EmptyState } from "@/components/ui";
import { dayLabel, hm } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { myPublishedShifts, openCard } from "@/lib/store";
import { ClockPanel } from "./clock-panel";

export const metadata: Metadata = { title: "Checar" };
export const dynamic = "force-dynamic";

// S16 clock in/out + S15 my upcoming shifts. Phone-first; managers can use it too.
export default async function ClockPage() {
  const s = await requireSession();
  const tz = s.location.timezone;
  const today = localDate(new Date(), tz);
  const { start } = localRange(today, 1, tz);
  const { end } = localRange(today, 14, tz);
  const [card, shifts] = await Promise.all([openCard(s), myPublishedShifts(s, start, end)]);
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
        <Link href="/account" className="text-sm text-accent underline">Cuenta</Link>
        <form action={signOutAction}><button className="text-sm text-accent underline">Salir</button></form>
      </header>

      <Card>
        <p className="text-sm text-text-muted">
          {todays.length ? <>Hoy {todays.map((x) => `${hm(x.startAt, tz)}–${hm(x.endAt, tz)}`).join(", ")} · {todays[0].jobTitle ?? "Turno"}</> : "Hoy no tienes turno programado."}
        </p>
        <ClockPanel clockedInAt={card?.clockInAt ?? null} tz={tz} />
      </Card>

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
