"use client";
import { resolveReviewAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Button, Field, Select } from "@/components/ui";
import type { ParsedBooking } from "@turno/core";

const names: [string, string][] = [["guruwalk", "GuruWalk"], ["freetour", "Freetour.com"], ["strawberry", "Strawberry Tours"], ["getyourguide", "GetYourGuide"], ["viator", "Viator"], ["civitatis", "Civitatis"]];

export function ReviewForm({ item }: { item: { id: string; fromAddress: string; subject: string; platform: string; extracted: ParsedBooking; bodyText: string | null } }) {
  const x = item.extracted;
  return (
    <ActionForm action={resolveReviewAction} className="grid gap-3 rounded-md border border-border p-4">
      {() => (
        <>
          <input type="hidden" name="emailId" value={item.id} />
          <p className="text-sm"><span className="font-semibold">{item.subject || "(sin asunto)"}</span> <span className="text-text-muted">· {item.fromAddress}</span></p>
          {item.bodyText && <details><summary className="cursor-pointer text-xs text-accent">Ver correo</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-surface p-2 text-xs">{item.bodyText}</pre></details>}
          <div className="grid gap-3 sm:grid-cols-4">
            <Select label="Plataforma" name="platform" defaultValue={x.platform === "unknown" ? "guruwalk" : x.platform}>{names.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            <Select label="Tipo" name="kind" defaultValue={x.kind}><option value="new">Nueva</option><option value="change">Cambio</option><option value="cancel">Cancelación</option></Select>
            <Field label="Nº de reserva" name="externalRef" defaultValue={x.externalRef ?? ""} />
            <Field label="Personas" name="people" type="number" min="1" defaultValue={x.people ?? ""} />
            <Field label="Fecha" name="date" type="date" defaultValue={x.date ?? ""} />
            <Field label="Hora" name="time" type="time" defaultValue={x.time ?? ""} />
            <Field label="Tour" name="tourName" defaultValue={x.tourName ?? ""} />
            <Field label="Viajero" name="travellerName" defaultValue={x.travellerName ?? ""} />
          </div>
          <div className="flex gap-3">
            <Submit size="sm">Agregar al calendario</Submit>
            <Button size="sm" variant="ghost" name="ignore" value="1">No es una reserva</Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
