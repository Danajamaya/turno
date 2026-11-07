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

export const metadata: Metadata = { title: "Mensajes" };
export const dynamic = "force-dynamic";

const kindName = { reminder: "Recordatorio · mañana", review: "Pedir reseña" } as const;

// Today's messages, filled automatically: preview, edit, send by WhatsApp or email.
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ enviado?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const tz = s.location.timezone;
  await buildQueue(s);
  const [pending, sent] = await Promise.all([queue(s, "pending"), queue(s, "sent")]);
  return (
    <>
      <PageHeader title="Mensajes" />
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
