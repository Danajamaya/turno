import type { Metadata } from "next";
import { ChannelBadge } from "@/components/channel";
import { Card, PageHeader } from "@/components/ui";
import { comparePlatforms } from "@/lib/compare";
import { money } from "@/lib/format";
import { platformName } from "@/lib/guides";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "¿Dónde te conviene vender?" };
export const dynamic = "force-dynamic";

// Platforms side by side over the last year: what a person leaves, how many fail to show up, what they rate.
export default async function ComparePage() {
  const s = await requireSession(["owner", "manager"]);
  const rows = await comparePlatforms(s);
  const cur = s.company.currency;
  const best = rows[0], flaky = [...rows].filter((r) => r.bookings >= 5).sort((a, b) => b.noShowPct - a.noShowPct)[0];
  return (
    <>
      <PageHeader title="¿Dónde te conviene vender?" />
      <p className="-mt-4 mb-5 max-w-2xl text-sm text-text-muted">Últimos 12 meses, por plataforma. «Te deja por persona» es lo vendido menos lo que se queda la plataforma, más las propinas, dividido por las personas.</p>
      {best && (
        <div className="mb-5 grid gap-4 md:grid-cols-2">
          <Card className="p-5"><p className="text-sm text-text-muted">Te deja más por persona</p><p className="font-serif text-xl">{platformName[best.platform] ?? best.platform}</p><p className="tnum text-sm">{money(best.netPerPersonCents, cur)} por persona, con propinas</p></Card>
          {flaky && flaky.noShowPct > 0 && <Card className="p-5"><p className="text-sm text-text-muted">Más gente que no se presenta</p><p className="font-serif text-xl">{platformName[flaky.platform] ?? flaky.platform}</p><p className="tnum text-sm">{flaky.noShowPct} % de las reservas. Un recordatorio o una señal ayudan.</p></Card>}
        </div>
      )}
      <Card className="p-5">
        {rows.length === 0 ? <p className="text-sm text-text-muted">Todavía no hay tours terminados para comparar.</p> : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Comparación de plataformas">
            <table className="tnum w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-text-muted"><tr className="border-b border-border">{["Plataforma", "Reservas", "Personas", "Grupo medio", "Te deja por persona", "Propinas por persona", "Comisión", "No vienen", "Cancelan", "Valoración"].map((h) => <th key={h} scope="col" className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.platform} className="border-b border-border last:border-0">
                  <td className="py-3 pr-3"><ChannelBadge platform={r.platform} /></td><td>{r.bookings}</td><td>{r.people}</td><td>{r.avgGroup.toLocaleString("es-ES")}</td>
                  <td className="font-bold">{money(r.netPerPersonCents, cur)}</td><td>{money(r.tipsPerPersonCents, cur)}</td><td>{r.feePct} %</td>
                  <td className={r.noShowPct >= 15 ? "font-semibold text-danger" : ""}>{r.noShowPct} %</td><td>{r.cancelPct} %</td><td>{r.rating ? `${r.rating.toLocaleString("es-ES")} ★ (${r.reviews})` : "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
