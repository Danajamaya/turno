import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Compass, Globe, Landmark, Leaf, Palette, Search, Star, Users, UtensilsCrossed } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { SaveHeart } from "@/components/save-heart";
import { Cover } from "@/components/postcard";
import { photosFor } from "@/lib/media";
import { money } from "@/lib/format";
import { localeOf, pickLang, t } from "@/lib/i18n";
import { search, searchFacets, searchTours } from "@/lib/marketplace";

export const metadata: Metadata = { title: "Encuentra tu guía · Turno" };
export const dynamic = "force-dynamic";

const interestIcon = (x: string) => {
  const s = x.toLowerCase();
  if (/histor/.test(s)) return Landmark;
  if (/gastr|food|tapa|vino/.test(s)) return UtensilsCrossed;
  if (/arte|art/.test(s)) return Palette;
  if (/famil/.test(s)) return Users;
  return Compass;
};
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

// Travellers browse tours like Airbnb experiences, then meet the guide behind them.
export default async function GuideSearch({ searchParams }: { searchParams: Promise<{ city?: string; language?: string; interest?: string; date?: string; lang?: string; sustainable?: string }> }) {
  const q = await searchParams;
  const lang = await pickLang(q.lang), l = t(lang), loc = localeOf(lang);
  const [tours, guides, facets] = await Promise.all([searchTours(q), search(q), searchFacets()]);
  const photos = await photosFor([...tours.map((x) => x.tourId), ...guides.map((x) => x.companyId)]);
  const params = { city: q.city, language: q.language, interest: q.interest, date: q.date, sustainable: q.sustainable };
  const href = (o: Record<string, string | undefined>) => `/guias?${new URLSearchParams(Object.entries({ ...params, ...o, lang }).filter(([, v]) => v) as [string, string][])}`;
  const withInterest = (x?: string) => href({ interest: x });
  const field = "block w-full border-0 bg-transparent p-0 text-sm text-text placeholder:text-text-muted focus:outline-none";
  const cityName = guides[0]?.city && q.city ? guides[0].city : q.city;
  return (
    <div className="min-h-screen bg-bg">
      <PublicHeader lang={lang} path="/guias" params={params}>
        <form role="search" className="mx-auto grid max-w-[860px] grid-cols-2 items-center rounded-lg border border-border bg-bg shadow-pop sm:rounded-pill md:grid-cols-[1.3fr_1fr_1fr_1fr_auto]">
          <input type="hidden" name="lang" value={lang} />
          {q.sustainable && <input type="hidden" name="sustainable" value="1" />}
          <label className="col-span-2 rounded-pill px-6 py-2.5 hover:bg-surface focus-within:bg-surface md:col-span-1">
            <span className="block text-xs font-semibold">{l.where}</span>
            <input name="city" list="cities" defaultValue={q.city} placeholder={l.whereHint} className={field} aria-label={l.city} />
          </label>
          <datalist id="cities">{facets.cities.map((c) => <option key={c} value={c} />)}</datalist>
          <label className="border-border px-6 py-2.5 hover:bg-surface focus-within:bg-surface md:rounded-pill md:border-l">
            <span className="block text-xs font-semibold">{l.when}</span>
            <input type="date" name="date" defaultValue={q.date} className={field} aria-label={l.date} />
          </label>
          <label className="border-l border-border px-6 py-2.5 hover:bg-surface focus-within:bg-surface md:rounded-pill">
            <span className="block text-xs font-semibold">{l.language}</span>
            <select name="language" defaultValue={q.language ?? ""} className={field}><option value="">{l.any}</option>{facets.languages.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="hidden border-l border-border px-6 py-2.5 hover:bg-surface focus-within:bg-surface md:block md:rounded-pill">
            <span className="block text-xs font-semibold">{l.interest}</span>
            <select name="interest" defaultValue={q.interest ?? ""} className={field}><option value="">{l.any}</option>{facets.interests.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <div className="col-span-2 p-2 md:col-span-1">
            <button aria-label={l.search} className="flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-gold px-5 font-semibold text-on-gold md:w-12 md:px-0">
              <Search aria-hidden size={20} strokeWidth={2.5} /><span className="md:sr-only">{l.search}</span>
            </button>
          </div>
        </form>
      </PublicHeader>

      <nav aria-label={l.interest} className="border-b border-border">
        <ul className="mx-auto flex max-w-content gap-8 overflow-x-auto px-4 md:px-8">
          {[undefined, ...facets.interests].map((x) => {
            const Icon = x ? interestIcon(x) : Compass, on = (q.interest ?? "") === (x ?? "");
            return (
              <li key={x ?? "all"} className="shrink-0">
                <Link href={withInterest(x)} aria-current={on ? "page" : undefined}
                  className={`flex flex-col items-center gap-1.5 border-b-2 pb-3 pt-4 text-xs font-semibold transition-colors ${on ? "border-text text-text" : "border-transparent text-text-muted hover:border-border hover:text-text"}`}>
                  <Icon aria-hidden size={24} strokeWidth={1.75} />{x ?? l.all}
                </Link>
              </li>
            );
          })}
          <li className="shrink-0 border-l border-border pl-8">
            <Link href={href({ sustainable: q.sustainable ? undefined : "1" })} aria-current={q.sustainable ? "page" : undefined} title={l.sustainableWhy}
              className={`flex flex-col items-center gap-1.5 border-b-2 pb-3 pt-4 text-xs font-semibold transition-colors ${q.sustainable ? "border-success text-success" : "border-transparent text-text-muted hover:border-border hover:text-text"}`}>
              <Leaf aria-hidden size={24} strokeWidth={1.75} />{l.sustainable}
            </Link>
          </li>
        </ul>
      </nav>

      <main className="mx-auto max-w-content px-4 pb-16 pt-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-serif text-xl">{cityName ? l.toursIn(cityName) : l.toursAll}</h1>
            <p className="text-sm text-text-muted">{l.heroLine}</p>
          </div>
          <p className="text-sm text-text-muted" aria-live="polite">{l.results(tours.length)}</p>
        </div>

        {tours.length === 0 ? (
          <div className="rounded-lg border border-border p-8 text-center">
            <p className="text-lg">{l.noResults}</p>
            <Link href={`/guias?lang=${lang}`} className="mt-3 inline-block font-semibold underline">{l.all}</Link>
          </div>
        ) : (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tours.map((tr) => (
              <li key={tr.tourId} className="relative">
                <Link href={`/g/${tr.slug}?lang=${lang}#tour-${tr.tourId}`} className="group block rounded-lg">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                    <Cover photo={photos.get(tr.tourId)?.[0]} title={tr.title} time={tr.firstTime} about={tr.description ?? ""} className="transition-transform duration-base ease-brand group-hover:scale-[1.03]" />
                    <span className="absolute left-3 top-3 flex gap-1.5">
                      {(tr.priceModel === "free_tip" || tr.durationMin <= 60) && <span className="rounded-pill bg-bg px-3 py-1 text-xs font-semibold shadow-card">{tr.priceModel === "free_tip" ? l.tip : l.trial}</span>}
                      {tr.sustainable && <span className="inline-flex items-center gap-1 rounded-pill bg-bg px-2.5 py-1 text-xs font-semibold text-success shadow-card"><Leaf aria-hidden size={12} />{l.sustainable}</span>}
                    </span>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <h2 className="font-semibold leading-snug">{tr.title}</h2>
                    <span className="tnum inline-flex shrink-0 items-center gap-1 text-sm">
                      {tr.rating ? <><Star aria-hidden size={13} className="fill-text" />{tr.rating.toLocaleString(loc)} <span className="text-text-muted">({tr.reviews})</span></> : null}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted">{l.byGuide(tr.companyName, tr.city)}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-text-muted">
                    <span className="inline-flex items-center gap-1"><Clock aria-hidden size={13} />{duration(tr.durationMin)}</span>
                    {tr.firstTime && <span>{l.startsAt(tr.firstTime)}</span>}
                    {tr.languages.length > 0 && <span className="inline-flex items-center gap-1"><Globe aria-hidden size={13} />{tr.languages.join(", ")}</span>}
                  </p>
                  <p className="tnum mt-1.5">
                    {tr.priceModel === "free_tip" ? <b>{l.tip}</b> : <><b>{money(tr.priceCents, tr.currency)}</b> <span className="text-text-muted">{tr.priceModel === "per_person" ? l.perPerson : l.perGroup(0).split(" ·")[0]}</span></>}
                  </p>
                </Link>
                <div className="absolute right-2 top-2"><SaveHeart id={tr.tourId} label={l.save(tr.title)} /></div>
              </li>
            ))}
          </ul>
        )}

        {guides.length > 0 && (
          <section className="mt-16" aria-labelledby="guides">
            <h2 id="guides" className="mb-4 font-serif text-lg">{l.meetGuides}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((g) => (
                <li key={g.slug}>
                  <Link href={`/g/${g.slug}?lang=${lang}`} className="flex h-full items-center gap-4 rounded-lg border border-border p-4 transition-shadow duration-base hover:shadow-pop">
                    {photos.get(g.companyId)?.[0]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={`/api/media/${photos.get(g.companyId)![0]}`} alt="" className="h-16 w-16 shrink-0 rounded-pill object-cover" />
                      : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-pill bg-gradient-to-br from-gold to-ch-strawberry font-serif text-lg font-bold text-on-side">{g.companyName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>}
                    <span className="min-w-0">
                      <b className="flex items-center gap-1 truncate">{g.companyName}{g.sustainable && <Leaf size={14} className="shrink-0 text-success" role="img" aria-label={l.sustainable} />}</b>
                      <span className="line-clamp-2 text-sm text-text-muted">{g.headline}</span>
                      <span className="tnum mt-1 flex items-center gap-1 text-xs text-text-muted">{g.rating ? <><Star aria-hidden size={12} className="fill-text text-text" /><b className="text-text">{g.rating.toLocaleString(loc)}</b> ({l.reviews(g.reviews)}) · </> : null}{l.tours(g.tours)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-text-muted">{l.poweredBy} <b className="font-serif">Turno</b> · {l.guideSince}</footer>
    </div>
  );
}
