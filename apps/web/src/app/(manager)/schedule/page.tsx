import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { addLocalDays, grossCents, localDate, weekDays, weekStartOf, weeklyTotals } from "@turno/core";
import { copyWeekAction, deleteShiftAction, publishAction } from "@/app/actions";
import { Banner, Button, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { dayLabel, hm, hours, money, rangeLabel } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { getWeek, listMembers } from "@/lib/store";
import type { Member, Shift } from "@/lib/types";
import { ShiftForm } from "./shift-form";

export const metadata: Metadata = { title: "Horario" };

const card = (s: Shift) => ({ clockInAt: new Date(s.startAt), clockOutAt: new Date(s.endAt), unpaidBreakMinutes: s.unpaidBreakMin });

// S05 schedule builder (week by person), S06 shift editor, S07 copy week, S08 publish.
export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const tz = s.location.timezone;
  const today = localDate(new Date(), tz);
  const week = weekStartOf(q.semana && /^\d{4}-\d{2}-\d{2}$/.test(q.semana) ? q.semana : today, s.location.weekStartDay);
  const days = weekDays(week);
  const [{ week: row, shifts }, people] = await Promise.all([getWeek(s, week), listMembers(s)]);
  const staff = people.filter((p) => p.role !== "owner" || shifts.some((x) => x.memberId === p.id));
  const byId = new Map(people.map((p) => [p.id, p]));
  const dirty = shifts.filter((x) => x.dirty).length;
  const rules = { weeklyThresholdMinutes: s.location.otWeeklyMin, dailyThresholdMinutes: s.location.otDailyMin };

  // Projected hours and cost: per person with weekly OT, per day without.
  const perPerson = new Map<string, { minutes: number; cost: number; ot: number }>();
  for (const p of staff) {
    const mine = shifts.filter((x) => x.memberId === p.id).map(card);
    const t = weeklyTotals(mine, rules);
    perPerson.set(p.id, { minutes: t.workedMinutes, cost: grossCents(t, p.wageCents), ot: t.overtimeMinutes });
  }
  const perDay = days.map((d) => {
    const ds = shifts.filter((x) => localDate(new Date(x.startAt), tz) === d);
    const minutes = ds.reduce((n, x) => n + weeklyTotals([card(x)]).workedMinutes, 0);
    const cost = ds.reduce((n, x) => n + (x.memberId ? Math.round(weeklyTotals([card(x)]).workedMinutes * (byId.get(x.memberId)?.wageCents ?? 0) / 60) : 0), 0);
    return { minutes, cost };
  });
  const totalMinutes = [...perPerson.values()].reduce((n, x) => n + x.minutes, 0) + shifts.filter((x) => !x.memberId).reduce((n, x) => n + weeklyTotals([card(x)]).workedMinutes, 0);
  const totalCost = [...perPerson.values()].reduce((n, x) => n + x.cost, 0);

  const [addMember, addDate] = (q.nuevo ?? "").split("_");
  const adding = q.nuevo !== undefined && days.includes(addDate);
  const href = (extra: Record<string, string> = {}) => `/schedule?${new URLSearchParams({ semana: week, ...extra })}`;

  const rows: { key: string; label: string; sub: string; member: Member | null }[] = [
    ...staff.map((p) => {
      const t = perPerson.get(p.id)!;
      return { key: p.id, label: p.fullName, sub: `${p.jobTitle ?? "Sin puesto"} · ${hours(t.minutes)} h${t.ot ? ` · ${hours(t.ot)} h extra` : ""}`, member: p };
    }),
    { key: "open", label: "Turnos abiertos", sub: "Cualquiera puede tomarlos", member: null },
  ];

  return (
    <>
      <PageHeader title="Horario">
        <div className="flex items-center gap-1">
          <ButtonLink href={href({ semana: addLocalDays(week, -7) })} variant="ghost" size="sm" aria-label="Semana anterior"><ChevronLeft aria-hidden size={18} /></ButtonLink>
          <span className="tnum min-w-36 text-center text-sm font-semibold">{rangeLabel(days[0], days[6])}</span>
          <ButtonLink href={href({ semana: addLocalDays(week, 7) })} variant="ghost" size="sm" aria-label="Semana siguiente"><ChevronRight aria-hidden size={18} /></ButtonLink>
          {week !== weekStartOf(today, s.location.weekStartDay) && <ButtonLink href="/schedule" variant="ghost" size="sm">Hoy</ButtonLink>}
        </div>
        <form action={copyWeekAction}>
          <input type="hidden" name="from" value={addLocalDays(week, -7)} /><input type="hidden" name="to" value={week} />
          <Button variant="secondary">Copiar semana anterior</Button>
        </form>
        <form action={publishAction}>
          <input type="hidden" name="week" value={week} />
          <Button disabled={dirty === 0 && row?.status === "published"}>{row?.status === "published" && dirty === 0 ? "Publicado" : "Publicar"}</Button>
        </form>
      </PageHeader>

      <div className="mb-4 grid gap-3">
        {q.publicado !== undefined && <Banner tone="success" role="status">Horario publicado. {Number(q.publicado) === 1 ? "Se avisó a 1 persona." : `Se avisó a ${q.publicado} personas.`}</Banner>}
        {q.copiados !== undefined && <Banner tone="info" role="status">{q.copiados === "0" ? "La semana anterior no tenía turnos para copiar." : `Se copiaron ${q.copiados} turnos. Revisa y publica cuando esté listo.`}</Banner>}
        {dirty > 0 && <Banner tone="warning"><strong>Cambios sin publicar.</strong> {dirty === 1 ? "1 turno cambió" : `${dirty} turnos cambiaron`} desde la última publicación. Tu equipo todavía no los ve.</Banner>}
      </div>

      {adding && (
        <Card className="mb-6">
          <h2 className="mb-4 text-lg">Nuevo turno · {dayLabel(addDate)}</h2>
          <ShiftForm week={week} date={addDate} memberId={addMember === "open" ? "" : addMember} people={staff} defaultRole={byId.get(addMember)?.jobTitle ?? ""} cancelHref={href()} />
        </Card>
      )}

      {staff.length === 0 ? (
        <Card><EmptyState title="Primero agrega a tu equipo" body="Necesitas al menos una persona para armar el horario." action={<ButtonLink href="/team" variant="primary">Agregar personas</ButtonLink>} /></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-bg">
          <table className="w-full min-w-[960px] border-collapse text-left" aria-label={`Horario, semana del ${rangeLabel(days[0], days[6])}`}>
            <thead>
              <tr className="bg-surface text-xs text-text-muted">
                <th scope="col" className="sticky left-0 z-[1] w-48 border-b border-r border-border bg-surface p-2 font-semibold">Persona</th>
                {days.map((d, i) => (
                  <th key={d} scope="col" className={`border-b border-r border-border p-2 font-semibold ${d === today ? "text-accent" : ""}`}>
                    {dayLabel(d)}<span className="tnum block font-normal">{hours(perDay[i].minutes)} h · {money(perDay[i].cost)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="sticky left-0 z-[1] border-b border-r border-border bg-bg p-2 text-sm font-semibold">
                    {r.label}<span className="block text-xs font-normal text-text-muted">{r.sub}</span>
                  </th>
                  {days.map((d) => {
                    const cell = shifts.filter((x) => (r.member ? x.memberId === r.member.id : !x.memberId) && localDate(new Date(x.startAt), tz) === d);
                    return (
                      <td key={d} className="group border-b border-r border-border p-1 align-top">
                        <div className="grid gap-1">
                          {cell.map((x) => {
                            const colour = r.member?.colour ?? 0;
                            const overnight = localDate(new Date(x.endAt), tz) !== d;
                            return (
                              <div key={x.id} className={`relative rounded-sm border-l-[3px] px-2 py-1 text-xs ${colour ? `bg-role-${colour} text-role-${colour}-text border-role-${colour}-text` : "border border-dashed border-border-input bg-bg text-text-muted"}`}>
                                <span className="tnum block text-sm font-semibold">{hm(x.startAt, tz)}–{hm(x.endAt, tz)}</span>
                                {x.jobTitle ?? "Sin puesto"}{x.unpaidBreakMin ? ` · ${x.unpaidBreakMin} min descanso` : ""}{overnight ? " · termina al día siguiente" : ""}
                                {x.dirty && <span className="sr-only"> (sin publicar)</span>}
                                {x.dirty && <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-pill bg-accent" />}
                                <form action={deleteShiftAction} className="absolute bottom-1 right-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                                  <input type="hidden" name="shiftId" value={x.id} />
                                  <button aria-label={`Borrar turno de ${r.label}, ${dayLabel(d)} ${hm(x.startAt, tz)}`} className="rounded-sm p-1 hover:bg-bg"><Trash2 aria-hidden size={14} /></button>
                                </form>
                              </div>
                            );
                          })}
                          <Link href={href({ nuevo: `${r.member?.id ?? "open"}_${d}` })} aria-label={`Agregar turno a ${r.label}, ${dayLabel(d)}`}
                            className="flex h-8 items-center justify-center rounded-sm text-text-muted opacity-0 hover:bg-surface focus-visible:opacity-100 group-hover:opacity-100">
                            <Plus aria-hidden size={16} />
                          </Link>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface text-xs text-text-muted">
                <th scope="row" className="sticky left-0 z-[1] bg-surface p-2 font-semibold">Costo laboral</th>
                <td colSpan={7} className="tnum p-2">{hours(totalMinutes)} horas programadas · {money(totalCost)} proyectado (incluye horas extra)</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
