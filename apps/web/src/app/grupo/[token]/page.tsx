import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { pickLang } from "@/lib/i18n";
import { groupWhere } from "@/lib/ops";

export const metadata: Metadata = { title: "¿Dónde está el grupo?", robots: { index: false } };
export const dynamic = "force-dynamic";

// For a traveller running late: the meeting point and, during the tour, where the group is now.
export default async function GroupPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> }) {
  const en = (await pickLang((await searchParams).lang)) === "en";
  const g = await groupWhere((await params).token);
  if (!g) return <main className="mx-auto max-w-md px-4 py-16 text-center text-text-muted">{en ? "This link isn't valid." : "Este enlace no es válido."}</main>;
  const time = new Intl.DateTimeFormat(en ? "en-GB" : "es-ES", { hour: "2-digit", minute: "2-digit", timeZone: g.timezone });
  const box = (lat: number, lng: number) => `${lng - 0.004},${lat - 0.003},${lng + 0.004},${lat + 0.003}`;
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-8">
      <meta httpEquiv="refresh" content="60" />
      <header><p className="text-sm text-text-muted">{g.companyName}</p><h1 className="font-serif text-xl">{g.tourName}</h1><p className="text-sm">{en ? "Starts at" : "Sale a las"} {time.format(new Date(g.startsAt))}</p></header>
      {g.live ? (
        <section className="grid gap-2">
          <p className="flex items-center gap-2 font-semibold"><MapPin aria-hidden size={18} className="text-danger" />{en ? "The group is here" : "El grupo está aquí"} <span className="font-normal text-text-muted">({en ? "updated" : "actualizado"} {time.format(new Date(g.live.updatedAt))})</span></p>
          <iframe title={en ? "Map" : "Mapa"} className="aspect-square w-full rounded-lg border border-border" src={`https://www.openstreetmap.org/export/embed.html?bbox=${box(g.live.lat, g.live.lng)}&layer=mapnik&marker=${g.live.lat},${g.live.lng}`} />
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${g.live.lat},${g.live.lng}&travelmode=walking`} className="inline-flex h-12 items-center justify-center rounded-md bg-gold font-semibold text-on-gold">{en ? "Walk there" : "Cómo llegar andando"}</a>
        </section>
      ) : (
        <section className="rounded-lg bg-surface p-4 text-sm">
          <p className="font-semibold">{en ? "Meeting point" : "Punto de encuentro"}</p><p>{g.meetingPoint ?? "—"}</p>
          <p className="mt-2 text-text-muted">{en ? "Once the tour starts, the guide's position shows here." : "Cuando empiece el tour, aquí verás dónde va el grupo."}</p>
        </section>
      )}
      {(g.stops ?? []).length > 0 && <section className="text-sm"><p className="mb-1 font-semibold">{en ? "Route" : "Recorrido"}</p><ol className="list-decimal pl-5">{g.stops!.map((x, i) => <li key={i}>{x.name}</li>)}</ol></section>}
    </main>
  );
}
