"use client";
import { saveDiscountAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

export function DiscountForm() {
  return (
    <ActionForm action={saveDiscountAction} className="grid gap-3 sm:grid-cols-2" resetOnOk>
      {() => (
        <>
          <Field label="Código" name="code" id="dc-code" required placeholder="HOTELSOL10" />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label="Descuento" name="value" id="dc-value" inputMode="decimal" required placeholder="10" />
            <div><label htmlFor="dc-kind" className="mb-1 block text-sm font-semibold">En</label>
              <select id="dc-kind" name="kind" className="h-10 rounded-md border border-border-input bg-bg px-2"><option value="percent">%</option><option value="amount">€</option></select></div>
          </div>
          <Field label="Socio (opcional)" name="partnerName" id="dc-partner" placeholder="Hotel Sol, recepción" help="Un hotel o agencia que recomienda tus tours" />
          <Field label="Comisión del socio (%)" name="partnerCommission" id="dc-comm" type="number" min="0" max="50" defaultValue="0" />
          <Field label="Usos máximos (opcional)" name="maxUses" id="dc-max" type="number" min="1" />
          <Field label="Caduca (opcional)" name="expiresOn" id="dc-exp" type="date" />
          <div className="sm:col-span-2"><Submit variant="secondary">Crear código</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
