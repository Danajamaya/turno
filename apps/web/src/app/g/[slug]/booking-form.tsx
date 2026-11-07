"use client";
import { useState } from "react";
import { bookAction } from "@/app/actions";
import { joinWaitlistAction } from "@/app/growth-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";
import type { Departure } from "@/lib/marketplace";
import { localeOf, t, type Lang } from "@/lib/i18n-dict";

// Pick a departure (by day, then time), say how many and who: done.
export function BookingForm({ slug, tour, departures, tz, lang }: { slug: string; tour: { id: string; maxPeople: number; paid?: boolean; insurance?: string | null }; departures: Departure[]; tz: string; lang: Lang }) {
  const [pick, setPick] = useState<string>("");
  const [all, setAll] = useState(false);
  const l = t(lang);
  if (departures.length === 0) return <p className="mt-4 text-sm text-text-muted">{l.none}</p>;
  const day = (iso: string) => new Intl.DateTimeFormat(localeOf(lang), { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(iso));
  const chosen = departures.find((d) => d.startsAt === pick);
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-sm font-semibold">{l.pick}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={l.pick}>
        {departures.slice(0, all ? 16 : 6).map((d) => (
          <button key={d.startsAt} type="button" role="radio" aria-checked={pick === d.startsAt} onClick={() => setPick(d.startsAt)}
            className={`tnum rounded-md border px-3 py-2 text-left text-sm transition-colors duration-fast ${pick === d.startsAt ? "border-text bg-text text-bg" : d.left === 0 ? "border-dashed border-border-input bg-surface text-text-muted hover:border-text" : "border-border-input bg-bg hover:border-text"}`}>
            <span className="block font-semibold first-letter:uppercase">{day(d.startsAt)} · {d.time}</span>
            <span className={`block text-xs ${pick === d.startsAt ? "opacity-80" : "text-text-muted"}`}>{d.left === 0 ? l.full : d.left <= 5 ? l.left(d.left) : l.free}</span>
          </button>
        ))}
        {!all && departures.length > 6 && <button type="button" onClick={() => setAll(true)} className="rounded-md px-3 py-2 text-sm font-semibold underline">{l.more(Math.min(16, departures.length) - 6)}</button>}
      </div>
      {chosen && chosen.left === 0 && (
        <ActionForm action={joinWaitlistAction} className="mt-4 grid gap-3 rounded-lg bg-surface p-4 sm:grid-cols-2" resetOnOk>
          {(s) => (
            <>
              <p className="text-sm sm:col-span-2"><b>{l.waitTitle}</b> {l.waitSub}</p>
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="tourId" value={tour.id} /><input type="hidden" name="startsAt" value={chosen.startsAt} /><input type="hidden" name="lang" value={lang} />
              <Field label={l.people} name="people" type="number" min="1" max={tour.maxPeople} required defaultValue={s.fields?.people ?? "2"} />
              <Field label={l.name} name="name" required autoComplete="name" defaultValue={s.fields?.name} />
              <Field label={l.email} name="email" type="email" required autoComplete="email" defaultValue={s.fields?.email} />
              <div className="self-end"><Submit variant="secondary">{l.waitJoin}</Submit></div>
            </>
          )}
        </ActionForm>
      )}
      {chosen && chosen.left > 0 && (
        <ActionForm action={bookAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          {(s) => (
            <>
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="tourId" value={tour.id} /><input type="hidden" name="startsAt" value={chosen.startsAt} /><input type="hidden" name="lang" value={lang} />
              <Field label={l.people} name="people" type="number" min="1" max={Math.min(tour.maxPeople, chosen.left)} required defaultValue={s.fields?.people ?? "2"} />
              <Field label={l.name} name="name" required autoComplete="name" defaultValue={s.fields?.name} />
              <Field label={l.email} name="email" type="email" required autoComplete="email" defaultValue={s.fields?.email} help={l.emailHelp} />
              <Field label={l.phone} name="phone" type="tel" autoComplete="tel" defaultValue={s.fields?.phone} help={l.phoneHelp} />
              {tour.paid && <Field label={l.giftCode} name="gift" autoComplete="off" defaultValue={s.fields?.gift} placeholder="REGALO-XXXX-XXXX" help={l.giftHelp} />}
              {tour.paid && <Field label={l.discountCode} name="discount" autoComplete="off" defaultValue={s.fields?.discount} help={l.discountHelp} />}
              {tour.insurance && <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="insurance" className="mt-0.5 h-5 w-5" /><span><b>{l.insuranceAdd(tour.insurance)}</b><span className="block text-xs text-text-muted">{l.insuranceHelp}</span></span></label>}
              <div className="sm:col-span-2"><Submit size="lg" className="w-full sm:w-auto">{l.book}</Submit></div>
            </>
          )}
        </ActionForm>
      )}
    </div>
  );
}
