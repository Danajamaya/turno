"use client";
import { useState } from "react";
import type { FormState } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";

// Big amount buttons first (one tap), then "other amount".
export function TipForm({ action, token, currency, en }: { action: (s: FormState, f: FormData) => Promise<FormState>; token: string; currency: string; en: boolean }) {
  const [amount, setAmount] = useState("10");
  const sym = new Intl.NumberFormat(en ? "en-GB" : "es-ES", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  return (
    <ActionForm action={action} className="grid gap-4">
      {() => (
        <>
          <input type="hidden" name="token" value={token} /><input type="hidden" name="amount" value={amount} />
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={en ? "Amount" : "Importe"}>
            {["5", "10", "15", "20"].map((a) => (
              <button key={a} type="button" role="radio" aria-checked={amount === a} onClick={() => setAmount(a)}
                className={`tnum h-16 rounded-lg border text-lg font-bold transition-colors duration-fast ${amount === a ? "border-text bg-text text-bg" : "border-border-input bg-bg hover:border-text"}`}>{a} {sym}</button>
            ))}
          </div>
          <label className="text-sm font-semibold">{en ? "Or another amount" : "U otro importe"}
            <input name="other" inputMode="decimal" placeholder={`25 ${sym}`} className="mt-1 h-12 w-full rounded-md border border-border-input bg-bg px-3 text-base" />
          </label>
          <Submit size="lg" className="w-full bg-gold text-on-gold hover:bg-gold">{en ? "Leave a tip" : "Dejar propina"}</Submit>
        </>
      )}
    </ActionForm>
  );
}
