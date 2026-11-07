"use client";
import { useActionState, useState } from "react";
import { calendarFeedAction, type FormState } from "@/app/actions";
import { Button } from "./ui";

// The private link is shown once, right after it is made; making a new one
// turns the old one off.
export function CalendarSync({ has }: { has: boolean }) {
  const [state, run, pending] = useActionState<FormState>(calendarFeedAction, {});
  const [copied, setCopied] = useState(false);
  const url = state.ok;
  return (
    <div className="grid gap-4">
      {url ? (
        <div className="grid gap-2 rounded-md border border-success bg-success-soft p-4">
          <p className="font-semibold text-success">Tu enlace privado está listo. Guárdalo: solo se muestra ahora.</p>
          <p className="break-all rounded-sm bg-bg p-2 font-mono text-xs">{url}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? "Copiado" : "Copiar enlace"}</Button>
            <a className="inline-flex h-8 items-center rounded-md border border-border-input bg-bg px-3 text-sm font-semibold" href={url.replace(/^https?:/, "webcal:")}>Abrir en Apple Calendar</a>
            <a className="inline-flex h-8 items-center rounded-md border border-border-input bg-bg px-3 text-sm font-semibold" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url.replace(/^https?:/, "webcal:"))}`} target="_blank" rel="noreferrer">Añadir a Google Calendar</a>
          </div>
        </div>
      ) : (
        <form action={run}><Button disabled={pending}>{has ? "Crear un enlace nuevo" : "Crear mi enlace de calendario"}</Button></form>
      )}
      {has && !url && <p className="text-sm text-text-muted">Ya tienes un enlace. Si creas uno nuevo, el anterior deja de funcionar (útil si lo compartiste por error).</p>}
      <ol className="grid gap-2 text-sm text-text-muted">
        <li><b className="text-text">Google Calendar:</b> Otros calendarios › + › Desde URL › pega el enlace.</li>
        <li><b className="text-text">iPhone o Mac:</b> toca «Abrir en Apple Calendar», o Ajustes › Calendario › Cuentas › Añadir calendario suscrito.</li>
        <li><b className="text-text">Outlook:</b> Añadir calendario › Suscribirse desde la web › pega el enlace.</li>
      </ol>
      <p className="text-xs text-text-muted">Tu calendario se actualiza solo (cada hora más o menos, según la app). Es de solo lectura: los cambios se hacen en Turno.</p>
    </div>
  );
}
