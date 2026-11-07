import type { Metadata } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { localDate } from "@turno/core";
import { ChannelBadge } from "@/components/channel";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { guideIncome } from "@/lib/guides";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Ingresos" };

const monthLabel = (ym: string) => { const s = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`)); return s[0].toUpperCase() + s.slice(1); };
const shift = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// G16 guide income by channel for a month.
export default async function IncomePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const ym = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : localDate(new Date(), s.location.timezone).slice(0, 7);
  const { rows, total } = await guideIncome(s, new Date(`${ym}-01T00:00:00Z`), new Date(`${shift(ym, 1)}-01T00:00:00Z`));
  const cur = s.company.currency;
  return (
    <>
      <PageHeader title="Ingresos">
        <div className="flex items-center gap-1">
          <ButtonLink href={`/ingresos?mes=${shift(ym, -1)}`} variant="ghost" size="sm" aria-label="Mes anterior"><ChevronLeft aria-hidden size={18} /></ButtonLink>
          <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(ym)}</span>
          <ButtonLink href={`/ingresos?mes=${shift(ym, 1)}`} variant="ghost" size="sm" aria-label="Mes siguiente"><ChevronRight aria-hidden size={18} /></ButtonLink>
        </div>
      </PageHeader>
      {rows.length === 0 ? (
        <Card><EmptyState title="Sin reservas este mes" body="Cuando tus plataformas te manden reservas, aquí ves cuánto ganaste en cada una." /></Card>
      ) : (
        <div className="grid gap-4">
          <Card className="tnum grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div><p className="text-text-muted">Te quedó</p><p className="text-xl">{money(total.netCents, cur)}</p></div>
            <div><p className="text-text-muted">Reservas · personas</p><p className="text-lg">{total.bookings} · {total.people}</p></div>
            <div><p className="text-text-muted">Propinas</p><p className="text-lg">{money(total.tipsCents, cur)}</p></div>
            <div><p className="text-text-muted">Pagaste a plataformas</p><p className="text-lg">{money(total.platformFeeCents + total.turnoCommissionCents, cur)}</p></div>
          </Card>
          <Card className="overflow-x-auto">
            <table className="tnum w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-text-muted"><tr className="border-b border-border">
                <th scope="col" className="py-2 font-semibold">Plataforma</th><th scope="col" className="py-2 font-semibold">Reservas</th><th scope="col" className="py-2 font-semibold">Personas</th>
                <th scope="col" className="py-2 font-semibold">Vendido</th><th scope="col" className="py-2 font-semibold">Propinas</th><th scope="col" className="py-2 font-semibold">Comisiones</th><th scope="col" className="py-2 font-semibold">Te quedó</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.platform} className="border-b border-border last:border-0">
                    <td className="py-3"><ChannelBadge platform={r.platform} /></td><td>{r.bookings}</td><td>{r.people}</td>
                    <td>{money(r.grossCents, cur)}</td><td>{money(r.tipsCents, cur)}</td><td>−{money(r.platformFeeCents + r.turnoCommissionCents, cur)}</td>
                    <td className="font-semibold">{money(r.netCents, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-text-muted">Las propinas las anotas al cerrar cada tour en el Calendario. Lo que cobra cada plataforma por persona se ajusta en Plataformas.</p>
        </div>
      )}
    </>
  );
}
