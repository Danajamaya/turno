"use client";
import { savePayRuleAction } from "@/app/growth-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";
import type { PayRule } from "@/lib/guide-pay";

export function PayRuleForm({ rule, currency }: { rule: PayRule; currency: string }) {
  const id = rule.memberId.slice(0, 8);
  return (
    <ActionForm action={savePayRuleAction} className="grid gap-3 rounded-md border border-border p-4">
      {() => (
        <>
          <input type="hidden" name="memberId" value={rule.memberId} />
          <b>{rule.fullName}</b>
          <div className="grid grid-cols-3 gap-2">
            <Field label={`Por tour (${currency})`} name="perTour" id={`pt-${id}`} inputMode="decimal" defaultValue={(rule.perTourCents / 100).toString()} />
            <Field label={`Por persona (${currency})`} name="perPerson" id={`pp-${id}`} inputMode="decimal" defaultValue={(rule.perPersonCents / 100).toString()} />
            <Field label="Propinas (%)" name="tipShare" id={`ts-${id}`} type="number" min="0" max="100" defaultValue={String(rule.tipShareBps / 100)} />
          </div>
          <Field label="Idiomas" name="languages" id={`lg-${id}`} defaultValue={rule.languages.join(", ")} help="Separados por comas: Español, English…" />
          <div><Submit size="sm" variant="secondary">Guardar</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
