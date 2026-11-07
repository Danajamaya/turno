import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Plug, CalendarSync } from "lucide-react";
import { setFeeAction } from "@/app/actions";
import { ChannelBadge } from "@/components/channel";
import { Badge, Banner, Button, Card, PageHeader } from "@/components/ui";
import { channels, forwardingAddress, PLATFORMS, platformName, reviewQueue } from "@/lib/guides";
import { requireSession } from "@/lib/session";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Plataformas" };

const senders: Record<string, string> = {
  guruwalk: "guruwalk.com", freetour: "freetour.com", strawberry: "strawberrytours.com",
  getyourguide: "getyourguide.com", viator: "viator.com", civitatis: "civitatis.com",
};

// G08 channel connections + G09 review queue.
import { apiKeys } from "@/lib/octo";
import { TEMPLATE } from "@/lib/importer";
import { appUrl } from "@/lib/email";
import { revokeApiKeyAction } from "@/app/pro-actions";
import { ApiKeyForm, ImportForm } from "./platform-tools";

export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ revisado?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const { revisado } = await searchParams;
  const [address, list, queue, keys] = await Promise.all([forwardingAddress(s), channels(s), reviewQueue(s), apiKeys(s)]);
  const gmailFilter = Object.values(senders).map((d) => `from:${d}`).join(" OR ");
  return (
    <>
      <PageHeader title="Plataformas" />
      <div className="grid max-w-4xl gap-6">
        {revisado === "agregada" && <Banner tone="success" role="status">Reserva agregada al calendario.</Banner>}
        {revisado === "descartado" && <Banner tone="info" role="status">Correo descartado.</Banner>}
        {queue.length > 0 && (
          <Card>
            <h2 className="mb-1 text-lg">Por revisar ({queue.length})</h2>
            <p className="mb-4 text-sm text-text-muted">Correos de reservas que no pudimos leer completos. Revisa los datos y agrégalos al calendario.</p>
            <div className="grid gap-4">{queue.map((q) => <ReviewForm key={q.id} item={q} />)}</div>
          </Card>
        )}
        <Card>
          <h2 className="mb-1 flex items-center gap-2 text-lg"><Mail aria-hidden size={18} /> Conecta todas tus plataformas</h2>
          <p className="mb-4 text-sm text-text-muted">Cada plataforma te manda un correo cuando alguien reserva o cancela. Turno los lee y los pone en tu calendario.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <p className="mb-1 font-semibold">Opción 1 · Conectar con Gmail</p>
              <p className="mb-3 text-sm text-text-muted">Un clic. Solo leemos los correos de estas plataformas.</p>
              <Button disabled title="Disponible cuando Google apruebe la verificación">Conectar con Gmail · Próximamente</Button>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="mb-1 font-semibold">Opción 2 · Reenvío automático</p>
              <p className="mb-2 text-sm text-text-muted">Sin dar acceso a tu correo. En Gmail: Configuración › Filtros › Crear filtro, pega esto en «De» y elige «Reenviar a» tu dirección:</p>
              <p className="mb-2 break-all rounded-sm bg-surface p-2 font-mono text-xs">{gmailFilter}</p>
              <p className="text-sm">Tu dirección: <span className="break-all font-mono text-xs font-semibold">{address}</span></p>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg"><Plug aria-hidden size={18} /> Tus plataformas</h2>
          <ul className="divide-y divide-border">
            {PLATFORMS.map((p) => {
              const c = list.find((x) => x.platform === p);
              return (
                <li key={p} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <ChannelBadge platform={p} />
                  <span className="mr-auto text-text-muted">
                    {c?.lastEventAt ? <>Última reserva recibida: {new Date(c.lastEventAt).toLocaleDateString("es-ES")}</> : "Esperando el primer correo"}
                    {(p === "getyourguide" || p === "viator") && " · API directa: próximamente"}
                  </span>
                  {c?.lastEventAt ? <Badge tone="approved">Conectada</Badge> : <Badge>Sin datos</Badge>}
                  <form action={setFeeAction} className="flex items-center gap-2">
                    <input type="hidden" name="platform" value={p} />
                    <label htmlFor={`fee-${p}`} className="text-xs text-text-muted">Te cobra € por persona</label>
                    <input id={`fee-${p}`} name="fee" inputMode="decimal" defaultValue={c ? (c.feePerPersonCents / 100).toFixed(2) : ""} className="tnum h-8 w-20 rounded-md border border-border-input bg-bg px-2" />
                    <Button size="sm" variant="secondary" aria-label={`Guardar comisión de ${platformName[p]}`}>Guardar</Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-1 flex items-center gap-2 text-lg"><CalendarSync aria-hidden size={18} /> Calendario de Google, Apple u Outlook</h2>
          <p className="text-sm text-text-muted">Todas tus reservas en el calendario del teléfono. <Link href="/calendario/sincronizar" className="font-semibold text-accent underline">Conectar mi calendario</Link></p>
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">Importar reservas antiguas</h2>
          <p className="mb-3 text-sm text-text-muted">Sube un Excel guardado como CSV (o lo que exporta tu plataforma) y tu historial, ingresos y viajeros quedan completos desde el primer día. Si importas el mismo archivo dos veces, no se duplica nada.</p>
          <ImportForm template={TEMPLATE} />
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">Conexión directa por API (OCTO)</h2>
          <p className="mb-3 text-sm text-text-muted">GetYourGuide, Viator y otras plataformas pueden conectarse a Turno con el estándar OCTO: ven tu disponibilidad real y las reservas entran al momento, sin correos. Crea una clave por plataforma y dásela a su equipo de conectividad.</p>
          {keys.length > 0 && <ul className="mb-4 divide-y divide-border text-sm">{keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-2"><span className="min-w-0 flex-1"><b>{k.label}</b> <span className="text-text-muted">{platformName[k.platform] ?? k.platform}</span>
              <span className="block text-xs text-text-muted">{k.revokedAt ? "Revocada" : k.lastUsedAt ? `Último uso: ${new Date(k.lastUsedAt).toLocaleString("es-ES")}` : "Sin usar todavía"}</span></span>
              {!k.revokedAt && <form action={revokeApiKeyAction}><input type="hidden" name="id" value={k.id} /><Button size="sm" variant="ghost">Revocar</Button></form>}</li>))}</ul>}
          <ApiKeyForm base={appUrl()} />
        </Card>
      </div>
    </>
  );
}
