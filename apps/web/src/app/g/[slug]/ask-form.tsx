"use client";
import { MessageCircle } from "lucide-react";
import { askAction } from "@/app/growth-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

// Ask the guide something before booking; the answer arrives by email.
export function AskForm({ slug, lang, label }: { slug: string; lang: "es" | "en"; label: string }) {
  const en = lang === "en";
  return (
    <details className="group mt-3 rounded-md border border-border-input">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-2 py-2.5 text-sm font-semibold"><MessageCircle aria-hidden size={16} />{label}</summary>
      <ActionForm action={askAction} className="grid gap-3 border-t border-border p-3" resetOnOk>
        {(s) => (
          <>
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="lang" value={lang} />
            <div><label htmlFor="ask-body" className="mb-1 block text-sm font-semibold">{en ? "Your question" : "Tu pregunta"}</label>
              <textarea id="ask-body" name="body" rows={3} required maxLength={2000} defaultValue={s.fields?.body} placeholder={en ? "Is it suitable for a wheelchair?" : "¿Es apto para silla de ruedas?"} className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm" /></div>
            <Field label={en ? "Your name" : "Tu nombre"} name="name" required autoComplete="name" defaultValue={s.fields?.name} />
            <Field label={en ? "Your email" : "Tu correo"} name="email" type="email" required autoComplete="email" defaultValue={s.fields?.email} />
            <Submit variant="secondary">{en ? "Send question" : "Enviar pregunta"}</Submit>
          </>
        )}
      </ActionForm>
    </details>
  );
}
