"use client";
import { useState } from "react";
import type { FormState } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

export function GiftForm({ action, slug, currency, en }: { action: (s: FormState, f: FormData) => Promise<FormState>; slug: string; currency: string; en: boolean }) {
  const [amount, setAmount] = useState("50");
  const sym = new Intl.NumberFormat(en ? "en-GB" : "es-ES", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  return (
    <ActionForm action={action} className="grid gap-4">
      {(s) => (
        <>
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="amount" value={amount} /><input type="hidden" name="lang" value={en ? "en" : "es"} />
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={en ? "Amount" : "Importe"}>
            {["25", "50", "75", "100"].map((a) => (
              <button key={a} type="button" role="radio" aria-checked={amount === a} onClick={() => setAmount(a)}
                className={`tnum h-14 rounded-lg border font-bold transition-colors duration-fast ${amount === a ? "border-text bg-text text-bg" : "border-border-input bg-bg hover:border-text"}`}>{a} {sym}</button>
            ))}
          </div>
          <Field label={en ? "Or another amount" : "U otro importe"} name="other" inputMode="decimal" defaultValue={s.fields?.other} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={en ? "Your name" : "Tu nombre"} name="buyerName" required defaultValue={s.fields?.buyerName} autoComplete="name" />
            <Field label={en ? "Your email" : "Tu correo"} name="buyerEmail" type="email" required defaultValue={s.fields?.buyerEmail} autoComplete="email" />
            <Field label={en ? "Who is it for?" : "¿Para quién es?"} name="recipientName" required defaultValue={s.fields?.recipientName} />
            <Field label={en ? "Their email (optional)" : "Su correo (opcional)"} name="recipientEmail" type="email" defaultValue={s.fields?.recipientEmail} help={en ? "Or give them the code yourself" : "O dale tú el código"} />
          </div>
          <div><label htmlFor="gift-msg" className="mb-1 block text-sm font-semibold">{en ? "Message (optional)" : "Mensaje (opcional)"}</label>
            <textarea id="gift-msg" name="message" rows={3} maxLength={500} defaultValue={s.fields?.message} className="w-full rounded-md border border-border-input bg-bg px-3 py-2" /></div>
          <Submit size="lg" className="w-full">{en ? "Buy gift card" : "Comprar tarjeta regalo"}</Submit>
        </>
      )}
    </ActionForm>
  );
}
