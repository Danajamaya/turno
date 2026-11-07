import type { Metadata } from "next";
import Link from "next/link";
import { Check, Phone, X } from "lucide-react";
import { localDate, localRange } from "@turno/core";
import { checkInAction } from "@/app/actions";
import { ChannelBadge } from "@/components/channel";
import { Card } from "@/components/ui";
import { hm } from "@/lib/format";
import QRCode from "qrcode";
import { myTours } from "@/lib/guide-app";
import { cardTipsCents, tipLink } from "@/lib/tips";
import { canSign } from "@/lib/sign";
import { equipmentState, groupLink } from "@/lib/ops";
import { ShareLocation } from "@/components/share-location";
import { bookingNotesAction, requestSwapAction, toggleEquipmentAction } from "@/app/pro-actions";
import { money } from "@/lib/format";
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
  const card = await cardTipsCents(s.company.id, tour.startsAt, tour.tourName);
  const closed = tour.tipsCents - card > 0; // closing records the cash tips; card tips add up on their own
  const tipUrl = canSign() ? await tipLink(s, tour.key) : null;
  const qr = tipUrl ? await QRCode.toString(tipUrl, { type: "svg", margin: 1, color: { dark: "#14224a", light: "#ffffff" } }) : null;
  const gear = await equipmentState(s, tour.key);
  const where = groupLink(s.company.id, tour.startsAt, tour.tourName);
  const upcoming = new Date(tour.startsAt) > new Date();
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
                <span className="flex flex-wrap items-center gap-x-3 text-xs text-text-muted"><ChannelBadge platform={a.platform} />{a.language && <span className="font-semibold uppercase">{a.language}</span>}{(a.children ?? 0) > 0 && <span>{a.children} {a.children === 1 ? "niño" : "niños"}</span>}{a.travellerPhone && <a href={`tel:${a.travellerPhone}`} className="inline-flex items-center gap-1 text-accent"><Phone aria-hidden size={12} />Llamar</a>}</span>
                {a.notes && <span className="mt-1 block rounded bg-gold-soft px-2 py-1 text-xs text-gold-ink">{a.notes}</span>}
                <details className="mt-1 text-xs"><summary className="cursor-pointer text-accent">Notas</summary>
                  <form action={bookingNotesAction} className="mt-2 grid gap-2">
                    <input type="hidden" name="bookingId" value={a.id} />
                    <label className="grid gap-1">Nota para el tour<input name="notes" defaultValue={a.notes ?? ""} maxLength={500} placeholder="Trae carrito, cumpleaños…" className="h-9 rounded-md border border-border-input bg-bg px-2 text-sm" /></label>
                    <label className="grid gap-1">Niños<input name="children" type="number" min="0" max="100" defaultValue={a.children ?? 0} className="h-9 w-20 rounded-md border border-border-input bg-bg px-2 text-sm" /></label>
                    <button className="justify-self-start rounded-md border border-border-input px-3 py-1.5 font-semibold">Guardar</button>
                  </form></details>
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
      {gear.items.length > 0 && (
        <Card className="p-4">
          <h2 className="text-lg">Antes de salir</h2>
          <p className="mb-2 text-sm text-text-muted">{gear.checked.length} de {gear.items.length} listos</p>
          <ul className="grid gap-1.5">{gear.items.map((it) => { const on = gear.checked.includes(it); return (
            <li key={it}><form action={toggleEquipmentAction}><input type="hidden" name="key" value={tour.key} /><input type="hidden" name="item" value={it} /><input type="hidden" name="checked" value={on ? "0" : "1"} />
              <button aria-pressed={on} className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left ${on ? "border-success bg-success-soft" : "border-border-input"}`}>
                <span aria-hidden className={`grid h-5 w-5 place-items-center rounded border ${on ? "border-success bg-success text-on-accent" : "border-border-input"}`}>{on && <Check size={14} />}</span>{it}</button></form></li>); })}</ul>
        </Card>
      )}
      <Card className="p-4">
        <h2 className="mb-1 text-lg">Para quien llega tarde</h2>
        <p className="mb-3 text-sm text-text-muted">Comparte dónde está el grupo. Los viajeros lo ven desde el enlace de su recordatorio{where ? "" : " (cuando esté activado en este servidor)"}.</p>
        <ShareLocation tourKey={tour.key} />
        {where && <p className="mt-2 text-center text-sm"><a href={where} className="font-semibold text-accent underline">Ver lo que ven ellos</a></p>}
      </Card>
      {qr && <Card className="p-4">
        <h2 className="text-lg">Propinas con tarjeta</h2>
        <p className="text-sm text-text-muted">Enseña este código al despedirte: pagan con el móvil y se suma solo a las propinas del tour.</p>
        <div className="mx-auto my-4 w-56 rounded-md bg-bg p-2" role="img" aria-label="Código QR para dejar propina" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="tnum text-center text-sm">Recibido por tarjeta: <b>{money(card, s.company.currency)}</b></p>
        <p className="mt-2 flex flex-wrap justify-center gap-4 text-sm">
          <a href={tipUrl!} className="font-semibold text-accent underline">Abrir el enlace de propina</a>
          <a href={`https://wa.me/?text=${encodeURIComponent(`¡Gracias por venir! Si quieres dejar propina: ${tipUrl}`)}`} className="font-semibold text-accent underline">Mandarlo por WhatsApp</a>
        </p>
      </Card>}
      <CloseTourForm tourKey={tour.key} closed={closed} tips={tour.tipsCents - card} currency={s.company.currency} />
      {s.member.role === "employee" && upcoming && (
        <details className="rounded-lg border border-border bg-surface-raised p-4 text-sm">
          <summary className="cursor-pointer font-semibold">¿No puedes llevar este tour? Pide un cambio</summary>
          <form action={requestSwapAction} className="mt-3 grid gap-2">
            <input type="hidden" name="key" value={tour.key} />
            <label className="grid gap-1">Nota (opcional)<input name="note" maxLength={300} placeholder="Tengo médico a esa hora" className="h-10 rounded-md border border-border-input bg-bg px-3" /></label>
            <button className="justify-self-start rounded-md bg-accent px-4 py-2 font-semibold text-on-accent">Pedir cambio al equipo</button>
          </form>
        </details>
      )}
      {tours.length > 1 && <p className="text-sm text-text-muted">Otros tours de hoy: {tours.filter((t) => t.key !== tour.key).map((t) => <Link key={t.key} href={`/clock/tour?k=${encodeURIComponent(t.key)}`} className="mr-3 text-accent underline">{hm(t.startsAt, tz)} {t.tourName}</Link>)}</p>}
    </main>
  );
}
