"use client";
import { closeTourAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

export function CloseTourForm({ tourKey, closed, tips, currency }: { tourKey: string; closed: boolean; tips: number; currency: string }) {
  return (
    <ActionForm action={closeTourAction} className="grid gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-card">
      {() => (
        <>
          <input type="hidden" name="key" value={tourKey} />
          <p className="font-semibold">{closed ? "Tour cerrado" : "Cerrar el tour"}</p>
          <p className="text-sm text-text-muted">Quien no esté marcado cuenta como que vino. Las propinas se reparten entre las reservas según cuántas personas trajo cada una.</p>
          <Field label={`Propinas en efectivo (${currency})`} name="tips" inputMode="decimal" defaultValue={tips ? (tips / 100).toFixed(2) : ""} />
          <Submit size="lg">{closed ? "Actualizar propinas" : "Cerrar tour"}</Submit>
        </>
      )}
    </ActionForm>
  );
}
