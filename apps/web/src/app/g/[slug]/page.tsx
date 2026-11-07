import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, Globe, MapPin, Star, Users } from "lucide-react";
import { ChannelBadge } from "@/components/channel";
import { LangSwitch } from "@/components/lang-switch";
import { Card } from "@/components/ui";
import { companyReviews } from "@/lib/crm";
import { money } from "@/lib/format";
import { localeOf, pickLang, t } from "@/lib/i18n";
import { departures, publicProfile } from "@/lib/marketplace";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await publicProfile((await params).slug);
  return p ? { title: `${p.companyName} · ${p.city || "tours"}`, description: p.headline } : { title: "No encontrado" };
}

const embed = (url: string | null) => {
  if (!url) return null;
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url)?.[1];
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url)?.[1];
  return vm ? `https://player.vimeo.com/video/${vm}` : null;
};

// The public profile, Preply style: who you are, what travellers say, then what you offer and when.
export default async function PublicProfile({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const lang = await pickLang((await searchParams).lang), l = t(lang);
  const p = await publicProfile(slug);
  if (!p) notFound();
  const tz = p.timezone ?? "Europe/Madrid";
  const [tours, reviews] = await Promise.all([
    Promise.all(p.tours.map(async (tour) => ({ ...tour, deps: await departures(tour, p.companyId, tz) }))),
    companyReviews(p.companyId, 6),
  ]);
  const video = embed(p.videoUrl);
  const initials = p.companyName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-gradient-to-br from-side-a to-side-b text-on-side">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 pt-4 text-sm">
          <Link href={`/guias?lang=${lang}`} className="font-serif font-bold tracking-wide">TURNO</Link>
          <LangSwitch lang={lang} path={`/g/${slug}`} />
        </div>
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-5 px-4 pb-10 pt-6">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-gold to-ch-strawberry font-serif text-xl font-bold">{initials}</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl">{p.companyName}</h1>
            {p.headline && <p className="mt-1 text-side-text">{p.headline}</p>}
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-side-text">
              {reviews.count > 0 && <span className="tnum inline-flex items-center gap-1.5 font-semibold text-on-side"><Star aria-hidden size={15} className="fill-gold text-gold" />{reviews.avg?.toLocaleString(localeOf(lang))} · {l.reviews(reviews.count)}</span>}
              {p.city && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={15} />{p.city}</span>}
              {p.languages.length > 0 && <span className="inline-flex items-center gap-1.5"><Globe aria-hidden size={15} />{p.languages.join(" · ")}</span>}
              {p.stats.travellers > 0 && <span className="tnum inline-flex items-center gap-1.5"><Users aria-hidden size={15} />{l.travellers(p.stats.travellers.toLocaleString(localeOf(lang)))}</span>}
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-content gap-6 px-4 py-8 lg:grid-cols-[360px_1fr]">
        <aside className="grid content-start gap-4">
          <Card className="p-5">
            {video && <div className="mb-4 aspect-video overflow-hidden rounded-md"><iframe src={video} title={p.companyName} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>}
            <h2 className="mb-2 font-serif text-lg">{l.about}</h2>
            <p className="whitespace-pre-wrap text-text-muted">{p.bio || "—"}</p>
            {p.specialities.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{p.specialities.map((x) => <span key={x} className="rounded-pill bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{x}</span>)}</div>}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-serif text-lg">{l.reviewsTitle}</h2>
            {reviews.count === 0 ? <p className="text-sm text-text-muted">{l.reviewsSoon}</p> : (
              <ul className="divide-y divide-border">
                {reviews.list.map((r, i) => (
                  <li key={i} className="py-3 text-sm">
                    <p className="flex items-center justify-between gap-2"><b>{r.authorName ?? "—"}</b><span className="text-gold" aria-label={`${r.rating}/5`}>{"★".repeat(r.rating)}<span className="text-border">{"★".repeat(5 - r.rating)}</span></span></p>
                    {r.body && <p className="mt-1 text-text-muted">“{r.body}”</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted"><span className="inline-flex items-center gap-1 text-success"><BadgeCheck aria-hidden size={13} />{l.verified}</span><ChannelBadge platform={r.platform} /></p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
        <section className="grid content-start gap-4" aria-label={l.toursPackages}>
          <h2 className="font-serif text-lg">{l.toursPackages}</h2>
          {tours.length === 0 && <Card><p className="text-text-muted">{l.noTours}</p></Card>}
          {tours.map((tour) => (
            <Card key={tour.id} className="p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">{tour.title}</h3>
                  {tour.description && <p className="mt-1 text-sm text-text-muted">{tour.description}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                    <span className="inline-flex items-center gap-1.5"><Clock aria-hidden size={14} />{tour.durationMin >= 60 ? `${Math.floor(tour.durationMin / 60)} h${tour.durationMin % 60 ? ` ${tour.durationMin % 60} min` : ""}` : `${tour.durationMin} min`}</span>
                    {tour.meetingPoint && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={14} />{tour.meetingPoint}</span>}
                  </p>
                </div>
                <p className="tnum text-right font-serif text-xl">{tour.priceModel === "free_tip" ? l.tip : money(tour.priceCents, tour.currency)}
                  <span className="block font-sans text-xs text-text-muted">{tour.priceModel === "per_person" ? l.perPerson : tour.priceModel === "per_group" ? l.perGroup(tour.maxPeoplePerBooking) : l.tipSub}</span></p>
              </div>
              <BookingForm slug={slug} tour={{ id: tour.id, maxPeople: tour.maxPeoplePerBooking }} departures={tour.deps} tz={tz} lang={lang} />
            </Card>
          ))}
        </section>
      </main>
      <footer className="pb-8 text-center text-xs text-text-muted">{l.poweredBy} <b className="font-serif">Turno</b></footer>
    </div>
  );
}
