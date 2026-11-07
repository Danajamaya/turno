import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Globe, MapPin, Star, Users } from "lucide-react";
import { Card } from "@/components/ui";
import { money } from "@/lib/format";
import { departures, publicProfile } from "@/lib/marketplace";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await publicProfile((await params).slug);
  return p ? { title: `${p.companyName} · tours en ${p.city || "tu ciudad"}`, description: p.headline } : { title: "No encontrado" };
}

const embed = (url: string | null) => {
  if (!url) return null;
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url)?.[1];
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url)?.[1];
  return vm ? `https://player.vimeo.com/video/${vm}` : null;
};

// The public profile, Preply style: who you are, then what you offer and when.
export default async function PublicProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await publicProfile(slug);
  if (!p) notFound();
  const tz = p.timezone ?? "Europe/Madrid";
  const tours = await Promise.all(p.tours.map(async (t) => ({ ...t, deps: await departures(t, p.companyId, tz) })));
  const video = embed(p.videoUrl);
  const initials = p.companyName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-gradient-to-br from-side-a to-side-b text-on-side">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-5 px-4 py-10">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-gold to-ch-strawberry font-serif text-xl font-bold">{initials}</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl">{p.companyName}</h1>
            {p.headline && <p className="mt-1 text-side-text">{p.headline}</p>}
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-side-text">
              {p.city && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={15} />{p.city}</span>}
              {p.languages.length > 0 && <span className="inline-flex items-center gap-1.5"><Globe aria-hidden size={15} />{p.languages.join(" · ")}</span>}
              {p.stats.travellers > 0 && <span className="tnum inline-flex items-center gap-1.5"><Users aria-hidden size={15} />{p.stats.travellers.toLocaleString("es-ES")} viajeros guiados</span>}
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-content gap-6 px-4 py-8 lg:grid-cols-[360px_1fr]">
        <aside className="grid content-start gap-4">
          <Card className="p-5">
            {video && <div className="mb-4 aspect-video overflow-hidden rounded-md"><iframe src={video} title={`Presentación de ${p.companyName}`} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>}
            <h2 className="mb-2 font-serif text-lg">Sobre nosotros</h2>
            <p className="whitespace-pre-wrap text-text-muted">{p.bio || "Pronto contaremos más."}</p>
            {p.specialities.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{p.specialities.map((x) => <span key={x} className="rounded-pill bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{x}</span>)}</div>}
          </Card>
          <p className="flex items-center gap-2 px-1 text-xs text-text-muted"><Star aria-hidden size={14} />Las reseñas aparecerán aquí tras los primeros tours reservados en Turno.</p>
        </aside>
        <section className="grid content-start gap-4" aria-label="Tours y paquetes">
          <h2 className="font-serif text-lg">Tours y paquetes</h2>
          {tours.length === 0 && <Card><p className="text-text-muted">Todavía no hay tours publicados.</p></Card>}
          {tours.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">{t.title}</h3>
                  {t.description && <p className="mt-1 text-sm text-text-muted">{t.description}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                    <span className="inline-flex items-center gap-1.5"><Clock aria-hidden size={14} />{t.durationMin >= 60 ? `${Math.floor(t.durationMin / 60)} h${t.durationMin % 60 ? ` ${t.durationMin % 60} min` : ""}` : `${t.durationMin} min`}</span>
                    {t.meetingPoint && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden size={14} />{t.meetingPoint}</span>}
                  </p>
                </div>
                <p className="tnum text-right font-serif text-xl">{t.priceModel === "free_tip" ? "A la voluntad" : money(t.priceCents, t.currency)}
                  <span className="block font-sans text-xs text-text-muted">{t.priceModel === "per_person" ? "por persona" : t.priceModel === "per_group" ? `por grupo · hasta ${t.maxPeoplePerBooking}` : "pagas lo que quieras al final"}</span></p>
              </div>
              <BookingForm slug={slug} tour={{ id: t.id, maxPeople: t.maxPeoplePerBooking }} departures={t.deps} tz={tz} />
            </Card>
          ))}
        </section>
      </main>
      <footer className="pb-8 text-center text-xs text-text-muted">Reservas con <b className="font-serif">Turno</b></footer>
    </div>
  );
}
