import type { Metadata } from "next";
import Link from "next/link";
import { ChannelBadge } from "@/components/channel";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { travellers } from "@/lib/crm";
import { dayLabel } from "@/lib/format";
import { localDate } from "@turno/core";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Viajeros" };

// Everyone who booked, from every platform.
export default async function TravellersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const { q = "" } = await searchParams;
  const list = await travellers(s, q);
  const tz = s.location.timezone;
  return (
    <>
      <PageHeader title="Viajeros">
        <form role="search" className="flex gap-2"><label htmlFor="q" className="sr-only">Buscar viajero</label>
          <input id="q" name="q" defaultValue={q} placeholder="Nombre, correo o teléfono" className="h-10 w-64 rounded-md border border-border-input bg-bg px-3" /></form>
      </PageHeader>
      <Card className="overflow-x-auto p-0">
        {list.length === 0 ? <div className="p-6"><EmptyState title={q ? "Nadie con ese nombre" : "Todavía no hay viajeros"} body="Llegan solos con cada reserva de tus plataformas." /></div> : (
          <table className="tnum w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-text-muted"><tr className="border-b border-border">{["Viajero", "Contacto", "Reservas", "Personas", "Última vez", "Plataformas"].map((h) => <th key={h} scope="col" className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-5 py-3"><Link href={`/viajeros/${t.id}`} className="font-semibold text-accent underline">{t.name || "Sin nombre"}</Link></td>
                  <td className="max-w-[14rem] truncate px-5 py-3 text-text-muted">{t.phone ?? t.email ?? "—"}</td>
                  <td className="px-5 py-3">{t.bookings}</td><td className="px-5 py-3">{t.people}</td>
                  <td className="px-5 py-3">{t.lastAt ? dayLabel(localDate(new Date(t.lastAt), tz)) : "—"}</td>
                  <td className="px-5 py-3"><span className="flex flex-wrap gap-2">{t.platforms.map((p) => <ChannelBadge key={p} platform={p} />)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
