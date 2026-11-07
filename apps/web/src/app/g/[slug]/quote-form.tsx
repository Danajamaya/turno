"use client";
import { Users } from "lucide-react";
import { quoteAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";
import { t, type Lang } from "@/lib/i18n-dict";

// Schools, companies and big groups ask for a price instead of booking seats.
export function QuoteForm({ slug, lang }: { slug: string; lang: Lang }) {
  const l = t(lang);
  return (
    <section aria-labelledby="quote-h" className="rounded-lg border border-border p-5">
      <h2 id="quote-h" className="flex items-center gap-2 font-serif text-lg"><Users aria-hidden size={20} />{l.quoteTitle}</h2>
      <p className="mb-4 text-sm text-text-muted">{l.quoteSub}</p>
      <ActionForm action={quoteAction} className="grid gap-3 sm:grid-cols-2" resetOnOk>
        {(s) => (
          <>
            <input type="hidden" name="slug" value={slug} /><input type="hidden" name="lang" value={lang} />
            <Field label={l.quoteSize} name="people" id="q-people" type="number" min="2" max="500" required defaultValue={s.fields?.people ?? "25"} />
            <Field label={l.quoteDate} name="date" id="q-date" type="date" defaultValue={s.fields?.date} />
            <div><label htmlFor="q-kind" className="mb-1 block text-sm font-semibold">{l.quoteKind}</label>
              <select id="q-kind" name="groupKind" defaultValue={s.fields?.groupKind ?? l.quoteKinds[0]} className="h-10 w-full rounded-md border border-border-input bg-bg px-3">{l.quoteKinds.map((k) => <option key={k}>{k}</option>)}</select></div>
            <Field label={l.quoteName} name="name" id="q-name" required autoComplete="name" defaultValue={s.fields?.name} />
            <Field label={l.quoteEmail} name="email" id="q-email" type="email" required autoComplete="email" defaultValue={s.fields?.email} className="sm:col-span-2" />
            <div className="sm:col-span-2"><label htmlFor="q-body" className="mb-1 block text-sm font-semibold">{lang === "en" ? "Anything else? (optional)" : "¿Algo más? (opcional)"}</label>
              <textarea id="q-body" name="body" rows={2} maxLength={2000} defaultValue={s.fields?.body} className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm" /></div>
            <div className="sm:col-span-2"><Submit variant="secondary">{l.quoteSend}</Submit></div>
          </>
        )}
      </ActionForm>
    </section>
  );
}
