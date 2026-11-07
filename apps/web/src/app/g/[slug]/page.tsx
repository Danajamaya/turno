import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarCheck, ChevronLeft, Clock, Gift, Globe, MapPin, Star, Users, Wallet } from "lucide-react";
import { ChannelBadge } from "@/components/channel";
import { PublicHeader } from "@/components/public-header";
import { Cover } from "@/components/postcard";
import { photosFor } from "@/lib/media";
import { companyReviews } from "@/lib/crm";
import { money } from "@/lib/format";
import { localeOf, pickLang, t } from "@/lib/i18n";
import { departures, publicProfile } from "@/lib/marketplace";
import { AskForm } from "./ask-form";
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
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

// The public profile, Preply style: who the guide is and what travellers say on
// the left, a booking card that stays in view on the right, tours with their times below.
export default async function PublicProfile({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const lang = await pickLang((await searchParams).lang), l = t(lang), loc = localeOf(lang);
  const p = await publicProfile(slug);
  if (!p) notFound();
  const tz = p.timezone ?? "Europe/Madrid";
  const [tours, reviews] = await Promise.all([
    Promise.all(p.tours.map(async (tour) => ({ ...tour, deps: await departures(tour, p.companyId, tz) }))),
    companyReviews(p.companyId, 8),
  ]);
  const video = embed(p.videoUrl);
  const photos = await photosFor([p.companyId, ...tours.map((x) => x.id)]);
  const avatar = photos.get(p.companyId)?.[0];
  const initials = p.companyName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const paid = tours.filter((x) => x.priceModel !== "free_tip");
  const from = paid.length ? Math.min(...paid.map((x) => x.priceCents)) : null;
  const next = tours.flatMap((x) => x.deps.filter((d) => d.left > 0).map((d) => ({ ...d, tour: x }))).sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 4);
  const when = (iso: string) => new Intl.DateTimeFormat(loc, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  const firstTime = (x: (typeof tours)[number]) => [...x.weeklySlots].map((s) => s.time).sort()[0] ?? null;

  return (
    <div className="min-h-screen bg-bg">
      <PublicHeader lang={lang} path={`/g/${slug}`}>
        <Link href={`/guias?lang=${lang}`} className="inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text"><ChevronLeft aria-hidden size={16} />{l.toursAll}</Link>
      </PublicHeader>

      <main className="mx-auto grid max-w-content gap-10 px-4 pb-16 pt-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-12">
          <section className="flex flex-wrap items-start gap-6">
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/media/${avatar}`} alt={p.companyName} className="h-28 w-28 shrink-0 rounded-lg object-cover shadow-pop" />
              : <span className="grid h-28 w-28 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-gold to-ch-strawberry font-serif text-display text-on-side shadow-pop">{initials}</span>}
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-xl md:text-display">{p.companyName}</h1>
              {p.headline && <p className="mt-2 text-lg font-normal text-text-muted">{p.headline}</p>}
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {reviews.count > 0 && <li className="tnum inline-flex items-center gap-1.5 font-semibold"><Star aria-hidden size={16} className="fill-gold text-gold" />{reviews.avg?.toLocaleString(loc)} <span className="font-normal text-text-muted">({l.reviews(reviews.count)})</span></li>}
                {p.city && <li className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={16} className="text-text-muted" />{p.city}</li>}
                {p.languages.length > 0 && <li className="inline-flex items-center gap-1.5"><Globe aria-hidden size={16} className="text-text-muted" />{p.languages.join(", ")}</li>}
                {p.stats.travellers > 0 && <li className="tnum inline-flex items-center gap-1.5"><Users aria-hidden size={16} className="text-text-muted" />{l.travellers(p.stats.travellers.toLocaleString(loc))}</li>}
              </ul>
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-pill bg-success-soft px-3 py-1 text-xs font-semibold text-success"><BadgeCheck aria-hidden size={14} />{l.guideSince}</p>
            </div>
          </section>

          <section aria-labelledby="about">
            <h2 id="about" className="mb-3 font-serif text-lg">{l.about}</h2>
            <p className="max-w-[68ch] whitespace-pre-wrap leading-relaxed text-text-muted">{p.bio || "—"}</p>
            {p.specialities.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{p.specialities.map((x) => <span key={x} className="rounded-pill border border-border px-3 py-1 text-sm">{x}</span>)}</div>}
          </section>

          <section id="tours" aria-labelledby="tours-h" className="scroll-mt-24">
            <h2 id="tours-h" className="mb-4 font-serif text-lg">{l.toursPackages}</h2>
            {tours.length === 0 && <p className="text-text-muted">{l.noTours}</p>}
            <div className="grid gap-6">
              {tours.map((tour) => (
                <article key={tour.id} id={`tour-${tour.id}`} className="scroll-mt-24 overflow-hidden rounded-lg border border-border">
                  <div className="grid md:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="aspect-[16/9] md:aspect-[4/3] md:self-start"><Cover photo={photos.get(tour.id)?.[0]} title={tour.title} time={firstTime(tour)} about={tour.description ?? ""} rounded={false} /></div>
                    <div className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg">{tour.title}</h3>
                          {tour.description && <p className="mt-1 text-sm text-text-muted">{tour.description}</p>}
                          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                            <span className="inline-flex items-center gap-1.5"><Clock aria-hidden size={14} />{duration(tour.durationMin)}</span>
                            {tour.meetingPoint && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={14} />{tour.meetingPoint}</span>}
                          </p>
                        </div>
                        <p className="tnum text-right font-serif text-xl">{tour.priceModel === "free_tip" ? l.tip : money(tour.priceCents, tour.currency)}
                          <span className="block font-sans text-xs font-normal text-text-muted">{tour.priceModel === "per_person" ? l.perPerson : tour.priceModel === "per_group" ? l.perGroup(tour.maxPeoplePerBooking) : l.tipSub}</span></p>
                      </div>
                      <BookingForm slug={slug} tour={{ id: tour.id, maxPeople: tour.maxPeoplePerBooking, paid: tour.priceModel !== "free_tip" }} departures={tour.deps} tz={tz} lang={lang} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="reviews-h">
            <h2 id="reviews-h" className="mb-1 font-serif text-lg">{l.reviewsTitle}</h2>
            <p className="mb-5 text-sm text-text-muted">{l.verifiedOnly}</p>
            {reviews.count === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-sm text-text-muted">{l.reviewsSoon}</p> : (
              <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
                <div>
                  <p className="tnum font-serif text-hero">{reviews.avg?.toLocaleString(loc)}</p>
                  <p className="text-gold" aria-label={`${reviews.avg} ${l.outOf}`}>{"★".repeat(Math.round(reviews.avg ?? 0))}<span className="text-border">{"★".repeat(5 - Math.round(reviews.avg ?? 0))}</span></p>
                  <p className="text-sm text-text-muted">{l.reviews(reviews.count)}</p>
                  <ul className="mt-4 grid gap-1.5" aria-label={l.reviewsTitle}>
                    {reviews.dist.map((d) => (
                      <li key={d.rating} className="tnum flex items-center gap-2 text-xs text-text-muted">
                        <span className="w-3">{d.rating}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface"><span className="block h-full rounded-pill bg-text" style={{ width: `${(d.count / reviews.count) * 100}%` }} /></span>
                        <span className="w-5 text-right">{d.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <ul className="grid gap-6 sm:grid-cols-2">
                  {reviews.list.map((r, i) => (
                    <li key={i} className="text-sm">
                      <p className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-pill bg-surface font-semibold">{(r.authorName ?? "?").slice(0, 1)}</span>
                        <span><b className="block">{r.authorName ?? "—"}</b><span className="text-xs text-gold" aria-label={`${r.rating}/5`}>{"★".repeat(r.rating)}<span className="text-border">{"★".repeat(5 - r.rating)}</span></span></span>
                      </p>
                      {r.body && <p className="mt-2 leading-relaxed">{r.body}</p>}
                      <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted"><span className="inline-flex items-center gap-1 text-success"><BadgeCheck aria-hidden size={13} />{l.verified}</span><ChannelBadge platform={r.platform} /></p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-lg border border-border bg-bg shadow-pop">
            <div className="aspect-video">
              {video ? <iframe src={video} title={p.companyName} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
                : tours[0] ? <Cover photo={photos.get(p.companyId)?.[1] ?? photos.get(tours[0].id)?.[0]} title={tours[0].title} time={firstTime(tours[0])} about={tours[0].description ?? ""} rounded={false} /> : null}
            </div>
            <div className="p-5">
              <p className="text-sm text-text-muted">{l.bookCard}</p>
              <p className="tnum font-serif text-xl">{from !== null ? `${l.from} ${money(from, p.currency)}` : l.tip}</p>
              {from !== null && tours.some((x) => x.priceModel === "free_tip") && <p className="text-sm text-text-muted">{l.tip}: {l.tipSub}</p>}
              {next.length > 0 && (
                <>
                  <p className="mb-2 mt-5 text-sm font-semibold">{l.nextDeps}</p>
                  <ul className="grid gap-2">
                    {next.map((d) => (
                      <li key={d.startsAt + d.tour.id}>
                        <a href={`#tour-${d.tour.id}`} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:border-text">
                          <span className="min-w-0"><b className="tnum block first-letter:uppercase">{when(d.startsAt)}</b><span className="block truncate text-xs text-text-muted">{d.tour.title}</span></span>
                          <span className="shrink-0 text-xs text-text-muted">{d.left <= 5 ? l.left(d.left) : l.free}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <a href="#tours" className="mt-5 flex h-12 items-center justify-center rounded-md bg-gold font-semibold text-on-gold hover:brightness-95">{l.seeTimes}</a>
              <ul className="mt-4 grid gap-2 text-sm text-text-muted">
                <li className="flex items-center gap-2"><Wallet aria-hidden size={16} />{l.noFee}</li>
                <li className="flex items-center gap-2"><CalendarCheck aria-hidden size={16} />{l.instant}</li>
              </ul>
              <AskForm slug={slug} lang={lang} label={l.sendMessage} />
              {from !== null && <Link href={`/g/${slug}/regalo?lang=${lang}`} className="mt-4 flex items-center justify-center gap-2 rounded-md border border-border-input py-2.5 text-sm font-semibold hover:border-text"><Gift aria-hidden size={16} className="text-ch-strawberry" />{l.giveTour}</Link>}
            </div>
          </div>
        </aside>
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-text-muted">{l.poweredBy} <b className="font-serif">Turno</b></footer>
    </div>
  );
}
