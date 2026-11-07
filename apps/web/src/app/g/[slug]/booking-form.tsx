"use client";
import { useState } from "react";
import { bookAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";
import type { Departure } from "@/lib/marketplace";

// Pick a departure (by day, then time), say how many and who: done.
export function BookingForm({ slug, tour, departures, tz }: { slug: string; tour: { id: string; maxPeople: number }; departures: Departure[]; tz: string }) {
  const [pick, setPick] = useState<string>("");
  if (departures.length === 0) return <p className="mt-4 text-sm text-text-muted">No hay salidas en las próximas dos semanas.</p>;
  const day = (iso: string) => new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
  const chosen = departures.find((d) => d.startsAt === pick);
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-sm font-semibold">Elige día y hora</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Salidas disponibles">
        {departures.slice(0, 16).map((d) => (
          <button key={d.startsAt} type="button" role="radio" aria-checked={pick === d.startsAt} disabled={d.left === 0} onClick={() => setPick(d.startsAt)}
            className={`tnum rounded-md border px-3 py-2 text-left text-sm disabled:opacity-40 ${pick === d.startsAt ? "border-accent bg-accent-soft text-accent" : "border-border-input bg-bg hover:bg-surface"}`}>
            <span className="block font-semibold first-letter:uppercase">{day(d.startsAt)} · {d.time}</span>
            <span className="block text-xs text-text-muted">{d.left === 0 ? "Completo" : d.left <= 5 ? `Quedan ${d.left}` : "Plazas libres"}</span>
          </button>
        ))}
      </div>
      {chosen && (
        <ActionForm action={bookAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          {(s) => (
            <>
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="tourId" value={tour.id} /><input type="hidden" name="startsAt" value={chosen.startsAt} />
              <Field label="Personas" name="people" type="number" min="1" max={Math.min(tour.maxPeople, chosen.left)} required defaultValue={s.fields?.people ?? "2"} />
              <Field label="Tu nombre" name="name" required autoComplete="name" defaultValue={s.fields?.name} />
              <Field label="Correo" name="email" type="email" required autoComplete="email" defaultValue={s.fields?.email} help="Te mandamos la confirmación" />
              <Field label="Teléfono (opcional)" name="phone" type="tel" autoComplete="tel" defaultValue={s.fields?.phone} help="Por si el guía necesita avisarte" />
              <div className="sm:col-span-2"><Submit size="lg" className="w-full sm:w-auto">Reservar</Submit></div>
            </>
          )}
        </ActionForm>
      )}
    </div>
  );
}
