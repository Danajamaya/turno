"use client";
import { saveFiscalAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";
import type { Fiscal } from "@/lib/money";

export function FiscalForm({ f }: { f: Fiscal }) {
  return (
    <ActionForm action={saveFiscalAction} className="grid gap-3">
      {() => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre o razón social" name="legalName" defaultValue={f.legalName ?? ""} autoComplete="organization" />
            <Field label="NIF / CIF" name="taxId" defaultValue={f.taxId ?? ""} maxLength={20} />
          </div>
          <Field label="Dirección fiscal" name="fiscalAddress" defaultValue={f.fiscalAddress ?? ""} autoComplete="street-address" />
          <Field label="Enlace para reseñas en Google" name="googleReviewUrl" type="url" defaultValue={f.googleReviewUrl ?? ""} placeholder="https://g.page/r/…/review" help="En tu ficha de Google: «Pedir reseñas» y copia el enlace." />
          <div><Submit variant="secondary">Guardar</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
