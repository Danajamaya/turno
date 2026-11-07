import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { ChannelBadge } from "@/components/channel";
import { Badge, Card, Kpi } from "@/components/ui";
import { traveller, whatsappLink } from "@/lib/crm";
import { hm, money, moneyWhole } from "@/lib/format";
import { localDate } from "@turno/core";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Viajero" };
const statusName = { confirmed: "Confirmada", cancelled: "Cancelada", attended: "Vino", no_show: "No vino" } as const;

export default async function TravellerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const t = await traveller(s, (await params).id).catch(() => null);
  if (!t) notFound();
  const tz = s.location.timezone;
  const live = t.bookingList.filter((b) => b.status !== "cancelled");
  const day = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: tz }).format(new Date(iso));
  return (
    <div className="grid gap-5">
      <Link href="/viajeros" className="text-sm text-accent underline">← Viajeros</Link>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="mr-auto font-serif text-xl">{t.name || "Sin nombre"}</h1>
        {t.phone && <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1.5 text-sm text-accent"><Phone aria-hidden size={15} />{t.phone}</a>}
        {t.phone && <a href={whatsappLink(t.phone, `Hola ${t.name.split(" ")[0]}, `)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent"><MessageCircle aria-hidden size={15} />WhatsApp</a>}
        {t.email && <a href={`mailto:${t.email}`} className="inline-flex items-center gap-1.5 text-sm text-accent"><Mail aria-hidden size={15} />{t.email}</a>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Reservas" value={String(live.length)} edge="border-t-ch-viator" />
        <Kpi label="Personas" value={String(live.reduce((n, b) => n + b.people, 0))} edge="border-t-ch-guruwalk" />
        <Kpi label="Gastó en Turno" value={moneyWhole(live.reduce((n, b) => n + b.grossCents, 0), s.company.currency)} edge="border-t-gold" />
        <Kpi label="Reseñas" value={t.reviews.length ? `${t.reviews[0].rating} ★` : "—"} note={t.reviews[0]?.body ?? undefined} edge="border-t-ch-strawberry" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-serif text-lg">Reservas</h2>
          <ul className="divide-y divide-border text-sm">
            {t.bookingList.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="tnum w-28 text-text-muted">{day(b.startsAt)} {hm(b.startsAt, tz)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{b.tourName}</span><ChannelBadge platform={b.platform} /></span>
                <span className="tnum">{b.people} p.</span>
                {b.grossCents > 0 && <span className="tnum text-text-muted">{money(b.grossCents, b.currency)}</span>}
                <Badge tone={b.status === "attended" ? "approved" : b.status === "cancelled" ? "denied" : b.status === "no_show" ? "pending" : "invited"}>{statusName[b.status as keyof typeof statusName]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-serif text-lg">Mensajes</h2>
          {t.messages.length === 0 ? <p className="text-sm text-text-muted">Todavía no le escribiste.</p> : (
            <ul className="grid gap-3 text-sm">
              {t.messages.map((m) => (
                <li key={m.id} className="rounded-md border border-border p-3">
                  <p className="mb-1 text-xs text-text-muted">{m.kind === "reminder" ? "Recordatorio" : "Pedir reseña"} · {m.status === "sent" ? `enviado por ${m.sentVia}` : m.status === "skipped" ? "omitido" : "pendiente"} · {localDate(new Date(m.sentAt ?? m.dueOn), tz)}</p>
                  <p>{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
