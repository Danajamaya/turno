import type { Metadata } from "next";
import Link from "next/link";
import { Search, Star } from "lucide-react";
import { LangSwitch } from "@/components/lang-switch";
import { money } from "@/lib/format";
import { localeOf, pickLang, t } from "@/lib/i18n";
import { search, searchFacets } from "@/lib/marketplace";

export const metadata: Metadata = { title: "Encuentra tu guía · Turno" };
export const dynamic = "force-dynamic";

// Travellers search guides by city, date, language and interest.
export default async function GuideSearch({ searchParams }: { searchParams: Promise<{ city?: string; language?: string; interest?: string; date?: string; lang?: string }> }) {
  const q = await searchParams;
  const lang = await pickLang(q.lang), l = t(lang);
  const [hits, facets] = await Promise.all([search(q), searchFacets()]);
  const select = "h-11 w-full rounded-md border border-border-input bg-bg px-3 text-base text-text";
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-gradient-to-br from-side-a to-side-b text-on-side">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 pt-4"><span className="font-serif font-bold tracking-wide">TURNO</span><LangSwitch lang={lang} path="/guias" params={{ city: q.city, language: q.language, interest: q.interest, date: q.date }} /></div>
        <div className="mx-auto max-w-content px-4 pb-10 pt-8">
          <h1 className="font-serif text-xl">{l.findGuide}</h1>
          <p className="mt-1 text-side-text">{l.findSub}</p>
          <form className="mt-6 grid gap-3 rounded-lg bg-surface-raised p-4 text-text shadow-card sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]" role="search">
            <input type="hidden" name="lang" value={lang} />
            <label className="text-sm font-semibold">{l.city}<input name="city" list="cities" defaultValue={q.city} className={`${select} mt-1`} /></label>
            <datalist id="cities">{facets.cities.map((c) => <option key={c} value={c} />)}</datalist>
            <label className="text-sm font-semibold">{l.date}<input type="date" name="date" defaultValue={q.date} className={`${select} mt-1`} /></label>
            <label className="text-sm font-semibold">{l.language}<select name="language" defaultValue={q.language ?? ""} className={`${select} mt-1`}><option value="">{l.any}</option>{facets.languages.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="text-sm font-semibold">{l.interest}<select name="interest" defaultValue={q.interest ?? ""} className={`${select} mt-1`}><option value="">{l.any}</option>{facets.interests.map((x) => <option key={x}>{x}</option>)}</select></label>
            <button className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-md bg-gold px-5 font-semibold text-on-gold"><Search aria-hidden size={18} />{l.search}</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-content px-4 py-8">
        <p className="mb-4 text-sm text-text-muted">{l.results(hits.length)}</p>
        {hits.length === 0 ? <p className="rounded-lg border border-border bg-surface-raised p-6 text-text-muted">{l.noResults}</p> : (
          <ul className="grid gap-4 md:grid-cols-2">
            {hits.map((h) => (
              <li key={h.slug}>
                <Link href={`/g/${h.slug}?lang=${lang}`} className="flex h-full gap-4 rounded-lg border border-border bg-surface-raised p-5 shadow-card transition-colors hover:border-accent">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-gold to-ch-strawberry font-serif text-lg font-bold text-on-side">{h.companyName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-2"><b className="text-lg">{h.companyName}</b>
                      <span className="tnum text-sm">{h.rating ? <span className="inline-flex items-center gap-1 font-semibold"><Star aria-hidden size={14} className="fill-gold text-gold" />{h.rating.toLocaleString(localeOf(lang))} <span className="font-normal text-text-muted">({l.reviews(h.reviews)})</span></span> : <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{l.newGuide}</span>}</span></span>
                    <span className="mt-1 block text-sm text-text-muted">{h.headline}</span>
                    <span className="mt-2 block text-xs text-text-muted">{h.city} · {h.languages.join(", ")} · {l.tours(h.tours)}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">{h.specialities.slice(0, 4).map((x) => <span key={x} className="rounded-pill bg-surface px-2 py-0.5 text-xs">{x}</span>)}</span>
                    <span className="tnum mt-3 block font-semibold">{h.fromCents ? `${l.from} ${money(h.fromCents, h.currency)}` : l.tip}{h.hasFree && h.fromCents ? ` · ${l.tip}` : ""}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
