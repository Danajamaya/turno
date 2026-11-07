import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cover } from "@/components/postcard";
import { money } from "@/lib/format";
import { pickLang, t } from "@/lib/i18n";
import { departures, publicProfile } from "@/lib/marketplace";
import { photosFor } from "@/lib/media";
import { appUrl } from "@/lib/email";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

// The booking widget a guide pastes into their own website (inside an iframe):
// their tours with the next free times; booking opens the full page in a new tab.
export default async function Embed({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const lang = await pickLang((await searchParams).lang), l = t(lang);
  const p = await publicProfile(slug);
  if (!p) notFound();
  const tz = p.timezone ?? "Europe/Madrid";
  const tours = await Promise.all(p.tours.map(async (x) => ({ ...x, deps: (await departures(x, p.companyId, tz)).filter((d) => d.left > 0).slice(0, 3) })));
  const photos = await photosFor(tours.map((x) => x.id));
  const fmt = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz });
  return (
    <main className="grid gap-3 bg-bg p-3">
      {tours.map((x) => (
        <a key={x.id} href={`${appUrl()}/g/${slug}?lang=${lang}#tour-${x.id}`} target="_blank" rel="noopener" className="grid grid-cols-[96px_1fr] gap-3 rounded-lg border border-border p-2 hover:border-text">
          <div className="aspect-square overflow-hidden rounded-md"><Cover photo={photos.get(x.id)?.[0]} title={x.title} time={x.weeklySlots[0]?.time} about={x.description ?? ""} rounded={false} /></div>
          <div className="min-w-0 py-1">
            <b className="block truncate">{x.title}</b>
            <span className="tnum text-sm">{x.priceModel === "free_tip" ? l.tip : `${money(x.priceCents, x.currency)} ${x.priceModel === "per_person" ? l.perPerson : ""}`}</span>
            <span className="mt-1 block truncate text-xs text-text-muted first-letter:uppercase">{x.deps.map((d) => fmt.format(new Date(d.startsAt))).join(" · ") || l.none}</span>
            <span className="mt-1 inline-block rounded-md bg-gold px-3 py-1 text-xs font-semibold text-on-gold">{l.book}</span>
          </div>
        </a>
      ))}
      <p className="text-center text-xs text-text-muted">{l.poweredBy} <b className="font-serif">Turno</b></p>
    </main>
  );
}
