"use client";
import { useState } from "react";
import { submitReviewAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";
import { t, type Lang } from "@/lib/i18n-dict";

export function ReviewForm({ token, lang, name }: { token: string; lang: Lang; name: string }) {
  const [stars, setStars] = useState(0);
  const l = t(lang);
  return (
    <ActionForm action={submitReviewAction} className="grid gap-4">
      {() => (
        <>
          <input type="hidden" name="token" value={token} /><input type="hidden" name="lang" value={lang} /><input type="hidden" name="rating" value={stars} />
          <fieldset><legend className="mb-1 text-sm font-semibold">{l.stars}</legend>
            <div className="flex gap-1" role="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}/5`} onClick={() => setStars(n)}
                  className={`text-display leading-none ${n <= stars ? "text-gold" : "text-border"}`}>★</button>
              ))}
            </div>
          </fieldset>
          <div><label htmlFor="body" className="mb-1 block text-sm font-semibold">{l.comment}</label><textarea id="body" name="body" rows={4} maxLength={1500} className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-base" /></div>
          <Field label={l.yourName} name="author" defaultValue={name} maxLength={60} />
          <Submit size="lg">{l.send}</Submit>
        </>
      )}
    </ActionForm>
  );
}
