import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { addLocalDays, cardMinutes, grossCents, localDate, localRange, weekDays, weekStartOf, weeklyTotals } from "@turno/core";
import { approveAction } from "@/app/actions";
import { Badge, Banner, Button, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { dayLabel, hm, hours, money, rangeLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { cardsInRange, listMembers } from "@/lib/store";

export const metadata: Metadata = { title: "Hojas de horas" };

// S17 timesheets for a weekly pay period, S18 card list, approve. CSV export (S19) is next.
export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const tz = s.location.timezone;
  const q = await searchParams;
  const today = localDate(new Date(), tz);
  const week = weekStartOf(q.semana && /^\d{4}-\d{2}-\d{2}$/.test(q.semana) ? q.semana : today, s.location.weekStartDay);
  const days = weekDays(week);
  const { start, end } = localRange(week, 7, tz);
  const [cards, people] = await Promise.all([cardsInRange(s, start, end), listMembers(s)]);
  const rules = { weeklyThresholdMinutes: s.location.otWeeklyMin, dailyThresholdMinutes: s.location.otDailyMin };

  const rows = people.map((p) => {
    const mine = cards.filter((c) => c.memberId === p.id).sort((a, b) => a.clockInAt.localeCompare(b.clockInAt));
    const punches = mine.map((c) => ({ clockInAt: new Date(c.clockInAt), clockOutAt: c.clockOutAt ? new Date(c.clockOutAt) : null }));
    const t = weeklyTotals(punches, rules);
    const wage = mine[0]?.wageCents ?? p.wageCents;
    return { p, mine, t, pay: grossCents(t, wage), pending: mine.filter((c) => c.clockOutAt && !c.approvedAt) };
  }).filter((r) => r.mine.length > 0);
  const open = rows.reduce((n, r) => n + r.t.openCards, 0);
  const pendingIds = rows.flatMap((r) => r.pending.map((c) => c.id));
  const total = rows.reduce((n, r) => ({ minutes: n.minutes + r.t.workedMinutes, ot: n.ot + r.t.overtimeMinutes, pay: n.pay + r.pay }), { minutes: 0, ot: 0, pay: 0 });

  return (
    <>
      <PageHeader title="Hojas de horas">
        <div className="flex items-center gap-1">
          <ButtonLink href={`/timesheets?semana=${addLocalDays(week, -7)}`} variant="ghost" size="sm" aria-label="Periodo anterior"><ChevronLeft aria-hidden size={18} /></ButtonLink>
          <span className="tnum min-w-36 text-center text-sm font-semibold">{rangeLabel(days[0], days[6])}</span>
          <ButtonLink href={`/timesheets?semana=${addLocalDays(week, 7)}`} variant="ghost" size="sm" aria-label="Periodo siguiente"><ChevronRight aria-hidden size={18} /></ButtonLink>
        </div>
        <Button variant="secondary" disabled title="Próximamente"><Download aria-hidden size={16} /> Exportar CSV</Button>
        <form action={approveAction}>
          {pendingIds.map((id) => <input key={id} type="hidden" name="cardId" value={id} />)}
          <Button disabled={pendingIds.length === 0}>{pendingIds.length ? `Aprobar ${pendingIds.length}` : "Todo aprobado"}</Button>
        </form>
      </PageHeader>
      {open > 0 && <div className="mb-4"><Banner tone="warning">{open === 1 ? "1 persona sigue checada" : `${open} personas siguen checadas`}. Sus horas cuentan hasta ahora y no se pueden aprobar hasta que cheque salida.</Banner></div>}
      {rows.length === 0 ? (
        <Card><EmptyState title="Sin horas en este periodo" body="Cuando tu equipo cheque entrada y salida, sus horas aparecen aquí." /></Card>
      ) : (
        <div className="grid gap-4">
          <Card className="tnum grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-text-muted">Horas trabajadas</p><p className="text-lg">{hours(total.minutes)}</p></div>
            <div><p className="text-text-muted">Horas extra</p><p className="text-lg">{hours(total.ot)}</p></div>
            <div><p className="text-text-muted">Pago bruto estimado</p><p className="text-lg">{money(total.pay)}</p></div>
          </Card>
          {rows.map(({ p, mine, t, pay }) => (
            <Card key={p.id}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="mr-auto text-lg">{p.fullName}</h2>
                <span className="tnum text-sm">{hours(t.regularMinutes)} h normales</span>
                <span className={`tnum text-sm ${t.overtimeMinutes ? "text-warning" : ""}`}>{hours(t.overtimeMinutes)} h extra</span>
                <span className="tnum text-sm font-semibold">{money(pay)}</span>
              </div>
              <ul className="divide-y divide-border text-sm">
                {mine.map((c) => (
                  <li key={c.id} className="tnum flex flex-wrap items-center gap-3 py-2">
                    <span className="w-20 text-text-muted">{dayLabel(localDate(new Date(c.clockInAt), tz))}</span>
                    <span className="mr-auto">{hm(c.clockInAt, tz)} – {c.clockOutAt ? hm(c.clockOutAt, tz) : "sigue checado"}</span>
                    <span>{hours(cardMinutes({ clockInAt: new Date(c.clockInAt), clockOutAt: c.clockOutAt ? new Date(c.clockOutAt) : null }))} h</span>
                    {!c.clockOutAt ? <Badge tone="pending">Abierta</Badge> : c.approvedAt ? <Badge tone="approved">Aprobada</Badge> : <Badge tone="neutral">Por aprobar</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
