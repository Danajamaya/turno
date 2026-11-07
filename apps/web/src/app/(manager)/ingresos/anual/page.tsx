import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { platformName } from "@/lib/guides";
import { csv, yearReport } from "@/lib/money";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Informe anual" };
export const dynamic = "force-dynamic";

// The year by quarter and platform: what to hand to the gestor for the quarterly and yearly returns.
export default async function YearPage({ searchParams }: { searchParams: Promise<{ año?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const year = /^\d{4}$/.test(q.año ?? "") ? Number(q.año) : new Date().getFullYear();
  const lines = await yearReport(s, year);
  const cur = s.company.currency;
  const sum = (k: "grossCents" | "platformFeeCents" | "turnoCommissionCents" | "tipsCents" | "netCents", quarter?: number) => lines.filter((l) => !quarter || l.quarter === quarter).reduce((n, l) => n + l[k], 0);
  const file = "data:text/csv;charset=utf-8," + encodeURIComponent(csv([
    ["Trimestre", "Plataforma", "Reservas", "Personas", "Vendido", "Comisión plataforma", "Comisión Turno", "Propinas", "Te quedó"],
    ...lines.map((l) => [`T${l.quarter}`, platformName[l.platform] ?? l.platform, l.bookings, l.people, (l.grossCents / 100).toFixed(2), (l.platformFeeCents / 100).toFixed(2), (l.turnoCommissionCents / 100).toFixed(2), (l.tipsCents / 100).toFixed(2), (l.netCents / 100).toFixed(2)]),
  ]));
  return (
    <>
      <PageHeader title={`Informe anual ${year}`}>
        <nav aria-label="Año" className="flex gap-2 text-sm font-semibold">
          <Link href={`/ingresos/anual?año=${year - 1}`} className="rounded-md border border-border-input px-3 py-1.5">{year - 1}</Link>
          <Link href={`/ingresos/anual?año=${year + 1}`} className="rounded-md border border-border-input px-3 py-1.5">{year + 1}</Link>
        </nav>
        <a href={file} download={`turno-${year}.csv`} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent">Descargar para la gestoría (CSV)</a>
      </PageHeader>
      <p className="-mt-4 mb-5 max-w-2xl text-sm text-text-muted">Por trimestre y plataforma: lo vendido, lo que se quedaron las plataformas, las propinas anotadas y lo que te quedó. Es la base para el pago fraccionado (modelo 130) y la renta; tu gestoría decide cómo se declara.</p>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((qn) => (
          <Card key={qn} className="p-5"><p className="text-sm font-semibold text-text-muted">Trimestre {qn}</p><p className="tnum font-serif text-xl">{money(sum("netCents", qn), cur)}</p>
            <p className="tnum text-xs text-text-muted">Vendido {money(sum("grossCents", qn), cur)}, propinas {money(sum("tipsCents", qn), cur)}</p></Card>
        ))}
      </div>
      <Card className="p-5">
        {lines.length === 0 ? <p className="text-sm text-text-muted">No hay reservas en {year}.</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Detalle por trimestre y plataforma">
            <table className="tnum w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-text-muted"><tr className="border-b border-border">{["Trimestre", "Plataforma", "Reservas", "Personas", "Vendido", "Comisiones", "Propinas", "Te quedó"].map((h) => <th key={h} scope="col" className="py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{lines.map((l) => (
                <tr key={`${l.quarter}-${l.platform}`} className="border-b border-border last:border-0">
                  <td className="py-2.5">T{l.quarter}</td><td>{platformName[l.platform] ?? l.platform}</td><td>{l.bookings}</td><td>{l.people}</td><td>{money(l.grossCents, cur)}</td>
                  <td>{money(l.platformFeeCents + l.turnoCommissionCents, cur)}</td><td>{money(l.tipsCents, cur)}</td><td className="font-semibold">{money(l.netCents, cur)}</td></tr>))}</tbody>
              <tfoot><tr className="font-bold"><td className="py-2.5" colSpan={4}>Total {year}</td><td>{money(sum("grossCents"), cur)}</td><td>{money(sum("platformFeeCents") + sum("turnoCommissionCents"), cur)}</td><td>{money(sum("tipsCents"), cur)}</td><td>{money(sum("netCents"), cur)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
