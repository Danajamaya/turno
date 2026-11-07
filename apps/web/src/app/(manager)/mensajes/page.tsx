import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { emailSendAction, skipMessageAction, whatsappSendAction } from "@/app/actions";
import { ChannelBadge } from "@/components/channel";
import { Banner, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { buildQueue, queue } from "@/lib/crm";
import { hm, dayLabel } from "@/lib/format";
import { localDate } from "@turno/core";
import { requireSession } from "@/lib/session";
import { inquiries } from "@/lib/inquiries";
import { ReplyBox } from "./reply-box";

export const metadata: Metadata = { title: "Mensajes" };
export const dynamic = "force-dynamic";

const kindName = { reminder: "Recordatorio · mañana", review: "Pedir reseña" } as const;

// Today's messages, filled automatically: preview, edit, send by WhatsApp or email.
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ enviado?: string; tab?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const tz = s.location.timezone;
  await buildQueue(s);
  const [pending, sent, asks] = await Promise.all([queue(s, "pending"), queue(s, "sent"), inquiries(s)]);
  const open = asks.filter((a) => a.status === "open").length;
  const tabs = (
    <nav aria-label="Secciones de mensajes" className="mb-5 flex gap-2 text-sm font-semibold">
      <Link href="/mensajes" aria-current={q.tab !== "preguntas" ? "page" : undefined} className={`rounded-pill px-4 py-2 ${q.tab !== "preguntas" ? "bg-text text-bg" : "border border-border-input"}`}>Cola de hoy ({pending.length})</Link>
      <Link href="/mensajes?tab=preguntas" aria-current={q.tab === "preguntas" ? "page" : undefined} className={`rounded-pill px-4 py-2 ${q.tab === "preguntas" ? "bg-text text-bg" : "border border-border-input"}`}>Preguntas de viajeros{open ? ` (${open})` : ""}</Link>
    </nav>
  );
  if (q.tab === "preguntas") return (
    <>
      <PageHeader title="Mensajes" />
      {tabs}
      <p className="-mt-2 mb-5 max-w-2xl text-sm text-text-muted">Lo que te preguntan desde tu página antes de reservar. Tu respuesta les llega por correo, con un enlace para seguir la conversación.</p>
      {asks.length === 0 ? <Card><EmptyState title="Sin preguntas por ahora" body="Cuando un viajero te escriba desde tu página, aparecerá aquí." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {asks.map((a) => (
            <Card key={a.id} className="p-5">
              <p className="mb-3 flex flex-wrap items-center gap-2 text-sm"><b className="mr-auto">{a.name}</b>
                {a.channel === "whatsapp" && <span className="rounded-pill bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">WhatsApp {a.phone ? `+${a.phone}` : ""}</span>}
                {a.kind === "quote" && <span className="rounded-pill bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-info">Presupuesto: {a.details?.people} personas{a.details?.groupKind ? `, ${a.details.groupKind}` : ""}{a.details?.date ? `, ${a.details.date}` : ""}</span>}
                <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${a.status === "open" ? "bg-gold-soft text-gold-ink" : "bg-success-soft text-success"}`}>{a.status === "open" ? "Sin contestar" : "Contestada"}</span>
                <span className="text-xs uppercase text-text-muted">{a.language}</span></p>
              <ol className="mb-3 grid gap-2">
                {a.messages.map((m, i) => (
                  <li key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.fromTraveller ? "bg-surface" : "ml-auto bg-accent-soft"}`}>
                    <span className="block text-xs text-text-muted">{m.fromTraveller ? a.name : m.memberName ?? "Tú"}, {dayLabel(localDate(new Date(m.createdAt), tz))} {hm(m.createdAt, tz)}</span>{m.body}
                  </li>
                ))}
              </ol>
              <ReplyBox id={a.id} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
  return (
    <>
      <PageHeader title="Mensajes" />
      {tabs}
      <p className="-mt-4 mb-5 max-w-2xl text-sm text-text-muted">Cada día se preparan solos: un recordatorio para quien viene mañana y una petición de reseña para quien vino. Revisa el texto, cámbialo si quieres y envíalo. Por WhatsApp se abre la conversación con el mensaje listo; tú solo tocas enviar.</p>
      {q.enviado && <div className="mb-4"><Banner tone="success" role="status">Correo enviado.</Banner></div>}
      {pending.length === 0 ? <Card><EmptyState title="Todo enviado por hoy" body="Mañana se preparan los siguientes." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-pill px-2.5 py-0.5 text-xs font-semibold ${m.kind === "reminder" ? "bg-info-soft text-info" : "bg-gold-soft text-gold-ink"}`}>{kindName[m.kind]}</span>
                <b className="mr-auto">{m.name ?? "Viajero"}</b>
                <span className="text-xs uppercase text-text-muted">{m.language}</span>
              </div>
              <p className="mb-3 flex flex-wrap gap-x-3 text-xs text-text-muted"><ChannelBadge platform={m.platform} />{m.tourName} · {dayLabel(localDate(new Date(m.startsAt), tz))} {hm(m.startsAt, tz)}</p>
              <form className="grid gap-3">
                <input type="hidden" name="id" value={m.id} /><input type="hidden" name="phone" value={m.phone ?? ""} />
                <label className="sr-only" htmlFor={`b-${m.id}`}>Mensaje para {m.name}</label>
                <textarea id={`b-${m.id}`} name="body" rows={4} defaultValue={m.body} maxLength={2000} className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  {m.phone && <Button size="sm" formAction={whatsappSendAction} className="bg-ch-guruwalk text-side-a hover:bg-ch-guruwalk"><MessageCircle aria-hidden size={16} />WhatsApp</Button>}
                  {m.email && <Button size="sm" variant="secondary" formAction={emailSendAction}><Mail aria-hidden size={16} />Correo</Button>}
                  <Button size="sm" variant="ghost" formAction={skipMessageAction}>Omitir</Button>
                  {!m.phone && !m.email && <span className="text-xs text-text-muted">Sin teléfono ni correo</span>}
                </div>
              </form>
            </Card>
          ))}
        </div>
      )}
      {sent.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 font-serif text-lg">Enviados esta semana</h2>
          <ul className="divide-y divide-border text-sm">
            {sent.map((m) => <li key={m.id} className="flex flex-wrap items-center gap-3 py-2"><span className="w-40 truncate font-semibold">{m.name}</span><span className="text-text-muted">{kindName[m.kind]}</span><span className="ml-auto text-xs text-text-muted">{m.tourName}</span></li>)}
          </ul>
        </Card>
      )}
      <p className="mt-4 text-sm"><Link href="/viajeros" className="text-accent underline">Ver todos los viajeros</Link></p>
    </>
  );
}
