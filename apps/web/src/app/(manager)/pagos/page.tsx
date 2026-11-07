import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { guidePay, payRules, suggestAssignments } from "@/lib/guide-pay";
import { requireSession } from "@/lib/session";
import { autoAssignAction } from "@/app/growth-actions";
import { PayRuleForm } from "./rule-form";

export const metadata: Metadata = { title: "Pagos a guías" };
export const dynamic = "force-dynamic";

const monthStart = (ym: string, add = 0) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + add, 1)); };

// How each guide is paid, what they earned this month, and who should lead the tours of the week.
export default async function PayPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const ym = /^\d{4}-\d{2}$/.test(q.mes ?? "") ? q.mes! : new Date().toISOString().slice(0, 7);
  const now = new Date();
  const [rules, lines, next] = await Promise.all([payRules(s), guidePay(s, monthStart(ym), monthStart(ym, 1)), suggestAssignments(s, now, new Date(now.getTime() + 7 * 86_400_000))]);
  const cur = s.company.currency, tz = s.location.timezone;
  const label = (d: Date) => new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const total = lines.reduce((n, l) => n + l.payCents, 0);
  const csv = "data:text/csv;charset=utf-8," + encodeURIComponent(["Guía;Tours;Personas;Propinas;Parte de propinas;A pagar", ...lines.map((l) => [l.fullName, l.tours, l.people, (l.tipsCents / 100).toFixed(2), (l.tipShareCents / 100).toFixed(2), (l.payCents / 100).toFixed(2)].join(";"))].join("\n"));
  const when = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz });
  return (
    <>
      <PageHeader title="Pagos a guías">
        <nav aria-label="Mes" className="flex items-center gap-2 text-sm font-semibold">
          <Link href={`/pagos?mes=${monthStart(ym, -1).toISOString().slice(0, 7)}`} className="rounded-md border border-border-input px-3 py-1.5" aria-label="Mes anterior">←</Link>
          <span className="first-letter:uppercase">{label(monthStart(ym))}</span>
          <Link href={`/pagos?mes=${monthStart(ym, 1).toISOString().slice(0, 7)}`} className="rounded-md border border-border-input px-3 py-1.5" aria-label="Mes siguiente">→</Link>
        </nav>
      </PageHeader>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg">Lo que se le debe a cada guía</h2><p className="tnum font-serif text-xl">{money(total, cur)}</p></div>
          {lines.length === 0 ? <p className="text-sm text-text-muted">Añade guías en «Guías» para ver aquí lo que gana cada uno.</p> : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Pagos del mes">
              <table className="tnum w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-text-muted"><tr className="border-b border-border">
                  <th scope="col" className="py-2 font-semibold">Guía</th><th scope="col" className="py-2 font-semibold">Tours</th><th scope="col" className="py-2 font-semibold">Personas</th>
                  <th scope="col" className="py-2 font-semibold">Propinas</th><th scope="col" className="py-2 font-semibold">Su parte</th><th scope="col" className="py-2 text-right font-semibold">A pagar</th></tr></thead>
                <tbody>{lines.map((l) => (
                  <tr key={l.memberId} className="border-b border-border last:border-0">
                    <td className="py-3 font-semibold">{l.fullName}</td><td>{l.tours}</td><td>{l.people}</td><td>{money(l.tipsCents, cur)}</td><td>{money(l.tipShareCents, cur)}</td>
                    <td className="text-right font-bold">{money(l.payCents, cur)}</td></tr>))}</tbody>
              </table>
            </div>
          )}
          <a href={csv} download={`pagos-guias-${ym}.csv`} className="mt-3 inline-block text-sm font-semibold text-accent underline">Descargar para la gestoría (CSV)</a>
          <p className="mt-2 text-xs text-text-muted">Cuentan los tours que ya se hicieron (con lista pasada). Las propinas son las anotadas al cerrar cada tour, en efectivo y con tarjeta.</p>
        </Card>
        <Card className="p-5">
          <h2 className="text-lg">Tours de esta semana sin guía</h2>
          <p className="mb-3 text-sm text-text-muted">Turno propone a quien está libre, habla el idioma del grupo y lleva menos tours.</p>
          {next.length === 0 ? <p className="text-sm text-text-muted">Todos los tours de los próximos 7 días tienen guía.</p> : (
            <>
              <ul className="mb-4 divide-y divide-border text-sm">
                {next.map((x) => <li key={x.key} className="py-2.5"><b className="first-letter:uppercase">{when.format(new Date(x.startsAt))}</b> {x.tourName}<span className="block text-text-muted">→ {x.fullName}: {x.reason}</span></li>)}
              </ul>
              <form action={autoAssignAction}><button className="rounded-md bg-accent px-4 py-2.5 font-semibold text-on-accent hover:bg-accent-hover">Asignar {next.length === 1 ? "este tour" : `estos ${next.length} tours`}</button></form>
            </>
          )}
        </Card>
      </div>
      <Card className="mt-6 p-5">
        <h2 className="mb-1 text-lg">Cómo se paga a cada guía</h2>
        <p className="mb-4 text-sm text-text-muted">Un fijo por tour, un importe por persona que vino y su parte de las propinas. Los idiomas sirven para proponer guía según el grupo.</p>
        <div className="grid gap-4 md:grid-cols-2">{rules.map((r) => <PayRuleForm key={r.memberId} rule={r} currency={cur} />)}</div>
      </Card>
    </>
  );
}
