import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { isPlatformAdmin, platformEarnings } from "@/lib/guides";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Turno · ganancias", robots: { index: false } };

const kindName = { commission: "Comisiones", subscription: "Suscripciones", refund: "Reembolsos" } as const;

// Turno's own earnings (platform admins only): subscriptions and commissions.
export default async function AdminPage() {
  const s = await requireSession();
  if (!(await isPlatformAdmin(s.userId))) notFound();
  const year = new Date().getUTCFullYear();
  const { byMonth, counts, settings } = await platformEarnings(s.userId, new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1)));
  const total = byMonth.reduce((n, r) => n + r.cents, 0);
  const months = [...new Set(byMonth.map((r) => r.month))];
  return (
    <main className="mx-auto max-w-content px-4 py-8">
      <PageHeader title={`Ganancias de Turno · ${year}`} />
      <div className="grid gap-4">
        <Card className="tnum grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div><p className="text-text-muted">Ganado en el año</p><p className="text-xl">{money(total, "EUR")}</p></div>
          <div><p className="text-text-muted">Negocios · pagando</p><p className="text-lg">{counts.companies} · {counts.payingCompanies}</p></div>
          <div><p className="text-text-muted">Reservas gestionadas</p><p className="text-lg">{counts.bookings}</p></div>
          <div><p className="text-text-muted">Vendido en Turno</p><p className="text-lg">{money(counts.marketplaceGmvCents, "EUR")}</p></div>
        </Card>
        <Card className="overflow-x-auto">
          <h2 className="mb-3 text-lg">Por mes</h2>
          {months.length === 0 ? <p className="text-sm text-text-muted">Todavía no hay ingresos este año.</p> : (
            <table className="tnum w-full text-left text-sm">
              <thead className="text-xs text-text-muted"><tr className="border-b border-border"><th scope="col" className="py-2 font-semibold">Mes</th>{Object.values(kindName).map((k) => <th key={k} scope="col" className="py-2 font-semibold">{k}</th>)}<th scope="col" className="py-2 font-semibold">Total</th></tr></thead>
              <tbody>{months.map((m) => {
                const of = (k: string) => byMonth.filter((r) => r.month === m && r.kind === k).reduce((n, r) => n + r.cents, 0);
                return <tr key={m} className="border-b border-border last:border-0"><td className="py-2">{m}</td>{Object.keys(kindName).map((k) => <td key={k}>{money(of(k), "EUR")}</td>)}<td className="font-semibold">{money(byMonth.filter((r) => r.month === m).reduce((n, r) => n + r.cents, 0), "EUR")}</td></tr>;
              })}</tbody>
            </table>
          )}
        </Card>
        <p className="text-xs text-text-muted">Comisión en ventas hechas en Turno: plan gratis {settings.commissionBpsFree / 100}% · plan de pago {settings.commissionBpsPaid / 100}%. Las reservas de otras plataformas no pagan comisión a Turno.</p>
      </div>
    </main>
  );
}
