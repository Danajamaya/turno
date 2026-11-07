import type { Metadata } from "next";
import Link from "next/link";
import { Check, Phone, X } from "lucide-react";
import { localDate, localRange } from "@turno/core";
import { checkInAction } from "@/app/actions";
import { ChannelBadge } from "@/components/channel";
import { Card } from "@/components/ui";
import { hm } from "@/lib/format";
import { myTours } from "@/lib/guide-app";
import { requireSession } from "@/lib/session";
import { CloseTourForm } from "./close-form";

export const metadata: Metadata = { title: "Pasar lista" };
export const dynamic = "force-dynamic";

// At the meeting point, on the guide's phone: who came, then close with the tips.
export default async function TourPage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const s = await requireSession();
  const tz = s.location.timezone, today = localDate(new Date(), tz);
  const { start, end } = localRange(today, 1, tz);
  const tours = await myTours(s, start, end);
  const { k } = await searchParams;
  const tour = tours.find((t) => t.key === k) ?? tours[0];
  if (!tour) return <main className="mx-auto max-w-md px-4 py-6"><Link href="/clock" className="text-sm text-accent underline">← Mi día</Link><p className="mt-6 text-text-muted">Hoy no tienes tours asignados.</p></main>;
  const came = tour.attendees.filter((a) => a.status === "attended").reduce((n, a) => n + a.people, 0);
  const closed = tour.tipsCents > 0; // checking everyone in is not closing: closing records the tips
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-6">
      <Link href="/clock" className="text-sm text-accent underline">← Mi día</Link>
      <section className="rounded-lg bg-gradient-to-br from-side-a to-side-b p-5 text-on-side shadow-card">
        <p className="text-sm text-side-text">Pasar lista</p>
        <p className="tnum font-serif text-xl">{hm(tour.startsAt, tz)} · {tour.tourName}</p>
        <p className="mt-2 inline-block rounded-pill bg-gold px-3 py-1 text-sm font-bold text-on-gold">{came} de {tour.people} llegaron</p>
      </section>
      <Card className="p-4">
        <ul className="divide-y divide-border">
          {tour.attendees.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.travellerName || "Sin nombre"} · {a.people}</span>
                <span className="flex items-center gap-3 text-xs text-text-muted"><ChannelBadge platform={a.platform} />{a.travellerPhone && <a href={`tel:${a.travellerPhone}`} className="inline-flex items-center gap-1 text-accent"><Phone aria-hidden size={12} />Llamar</a>}</span>
              </span>
              <form action={checkInAction} className="flex gap-1">
                <input type="hidden" name="bookingId" value={a.id} />
                <button name="present" value="1" aria-label={`${a.travellerName ?? "Reserva"} llegó`} aria-pressed={a.status === "attended"}
                  className={`grid h-11 w-11 place-items-center rounded-md border ${a.status === "attended" ? "border-success bg-success text-on-accent" : "border-border-input bg-bg text-text-muted"}`}><Check aria-hidden size={20} /></button>
                <button name="present" value="0" aria-label={`${a.travellerName ?? "Reserva"} no vino`} aria-pressed={a.status === "no_show"}
                  className={`grid h-11 w-11 place-items-center rounded-md border ${a.status === "no_show" ? "border-danger bg-danger text-on-danger" : "border-border-input bg-bg text-text-muted"}`}><X aria-hidden size={20} /></button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
      <CloseTourForm tourKey={tour.key} closed={closed} tips={tour.tipsCents} currency={s.company.currency} />
      {tours.length > 1 && <p className="text-sm text-text-muted">Otros tours de hoy: {tours.filter((t) => t.key !== tour.key).map((t) => <Link key={t.key} href={`/clock/tour?k=${encodeURIComponent(t.key)}`} className="mr-3 text-accent underline">{hm(t.startsAt, tz)} {t.tourName}</Link>)}</p>}
    </main>
  );
}
