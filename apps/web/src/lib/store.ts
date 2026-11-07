// Data layer on Postgres. Every user-facing function takes the Session and
// runs through withUser(), so row level security backs up the company and
// role checks written here. Server-only.
import "server-only";
import { addLocalDays, canClockIn, localDate, localRange, localTime, toInstant } from "@turno/core";
import { pgCode, system, withUser, type Tx } from "./db";
import { appUrl, sendEmail } from "./email";
import type { Company, Location, Member, Role, ScheduleWeek, Session, Shift, Subscription, TimeCard } from "./types";
import { FREE_PLAN_PEOPLE, RuleError } from "./types";

const MEMBER = "id, company_id, user_id, full_name, email, phone, role, status, job_title, wage_cents, colour";
const managerOnly = (s: Session) => {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede hacer esto.");
};

// ------------------------------------------------------------- sign-up & session

export async function createCompany(input: {
  companyName: string; industry: string | null; locationName: string; timezone: string;
  ownerName: string; ownerEmail: string;
}): Promise<{ userId: string; company: Company; location: Location; member: Member }> {
  return system(async (tx) => {
    const [taken] = await tx`select 1 from users where lower(email) = lower(${input.ownerEmail})`;
    if (taken) throw new RuleError("email_taken", "Ya existe una cuenta con ese correo. Entra con tu correo para continuar.");
    const [user] = await tx<{ id: string }[]>`insert into users (email, full_name) values (${input.ownerEmail}, ${input.ownerName}) returning id`;
    const [company] = await tx<Company[]>`insert into companies (name, industry) values (${input.companyName}, ${input.industry}) returning *`;
    const [location] = await tx<Location[]>`
      insert into locations (company_id, name, timezone) values (${company.id}, ${input.locationName}, ${input.timezone}) returning *`;
    const [member] = await tx<Member[]>`
      insert into members (company_id, user_id, full_name, email, role, status, colour)
      values (${company.id}, ${user.id}, ${input.ownerName}, ${input.ownerEmail}, 'owner', 'active', 8) returning ${tx.unsafe(MEMBER)}`;
    await tx`insert into location_members (location_id, member_id, company_id) values (${location.id}, ${member.id}, ${company.id})`;
    await tx`insert into subscriptions (company_id, plan, status) values (${company.id}, 'free', 'active')`;
    return { userId: user.id, company, location, member };
  });
}

/** The person's current workplace: their most recent active membership. */
export async function sessionForUser(userId: string): Promise<Session | null> {
  return withUser(userId, async (tx) => {
    const [member] = await tx<Member[]>`
      select ${tx.unsafe(MEMBER)} from members where user_id = ${userId} and status = 'active'
      order by created_at desc limit 1`;
    if (!member) return null;
    const [company] = await tx<Company[]>`select * from companies where id = ${member.companyId}`;
    const [location] = await tx<Location[]>`
      select l.* from locations l join location_members lm on lm.location_id = l.id
      where lm.member_id = ${member.id} and l.archived_at is null order by l.created_at limit 1`;
    return { userId, member, company, location };
  });
}

/** Development sign-in only: everyone, with a user row created on demand. */
export async function listAllMembersForDevLogin() {
  return system((tx) => tx<(Member & { companyName: string })[]>`
    select m.id, m.full_name, m.role, c.name as company_name from members m join companies c on c.id = m.company_id
    where m.status <> 'archived' order by c.name, m.full_name`);
}

export async function devUserForMember(memberId: string): Promise<string> {
  return system(async (tx) => {
    const [m] = await tx<Member[]>`select ${tx.unsafe(MEMBER)} from members where id = ${memberId}`;
    if (!m) throw new RuleError("not_found", "No existe.");
    let userId = m.userId;
    if (!userId) {
      [{ id: userId }] = await tx<{ id: string }[]>`
        insert into users (email, phone, full_name) values (${m.email}, ${m.phone ?? (m.email ? null : "dev-" + m.id)}, ${m.fullName}) returning id`;
      await tx`update members set user_id = ${userId} where id = ${m.id}`;
    }
    await tx`update members set status = 'active' where id = ${m.id} and status = 'invited'`;
    return userId!;
  });
}

// ------------------------------------------------------------- team

export async function listMembers(s: Session): Promise<Member[]> {
  return withUser(s.userId, (tx) => tx<Member[]>`
    select ${tx.unsafe(MEMBER)} from members where company_id = ${s.company.id} and status <> 'archived' order by full_name`);
}

export async function addMember(s: Session, input: {
  fullName: string; email: string | null; phone: string | null; role: Exclude<Role, "owner">; jobTitle: string | null; wageCents: number;
}): Promise<Member> {
  managerOnly(s);
  if (!input.email && !input.phone) throw new RuleError("unreachable", "Agrega un celular o un correo para poder mandarle la invitación.");
  if (input.role === "manager" && s.member.role !== "owner") throw new RuleError("forbidden", "Solo el dueño puede agregar gerentes.");
  const plan = await subscriptionFor(s);
  const people = await withUser(s.userId, async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from members where company_id = ${s.company.id} and status <> 'archived'`;
    return n;
  });
  if (plan.plan === "free" && people >= FREE_PLAN_PEOPLE) {
    throw new RuleError("plan_limit", `El plan gratis es para hasta ${FREE_PLAN_PEOPLE} personas. Cambia de plan en Configuración para agregar más.`);
  }
  // The login row is shared across businesses, so it is found or created outside RLS.
  const userId = await system(async (tx) => {
    const [found] = input.email
      ? await tx<{ id: string }[]>`select id from users where lower(email) = lower(${input.email})`
      : await tx<{ id: string }[]>`select id from users where phone = ${input.phone}`;
    if (found) return found.id;
    const [u] = await tx<{ id: string }[]>`insert into users (email, phone, full_name) values (${input.email}, ${input.phone}, ${input.fullName}) returning id`;
    return u.id;
  });
  const member = await withUser(s.userId, async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from members where company_id = ${s.company.id}`;
    try {
      const [m] = await tx<Member[]>`
        insert into members (company_id, user_id, full_name, email, phone, role, status, job_title, wage_cents, colour)
        values (${s.company.id}, ${userId}, ${input.fullName}, ${input.email}, ${input.phone}, ${input.role}, 'invited',
                ${input.jobTitle}, ${input.wageCents}, ${(n % 7) + 1})
        returning ${tx.unsafe(MEMBER)}`;
      await tx`insert into location_members (location_id, member_id, company_id) values (${s.location.id}, ${m.id}, ${s.company.id})`;
      return m;
    } catch (e) {
      if (pgCode(e) === "23505") throw new RuleError("duplicate", "Esa persona ya está en tu equipo.");
      throw e;
    }
  });
  if (member.email) {
    await sendEmail({
      to: member.email,
      subject: `${s.company.name} te invitó a Turno`,
      text: `Hola ${member.fullName.split(" ")[0]},\n\n${s.member.fullName} te agregó al equipo de ${s.company.name} en Turno, donde vas a ver tus turnos y checar entrada y salida.\n\nEntra con tu correo aquí: ${appUrl()}/login\n`,
    });
  }
  // SMS invites go out once Twilio is connected (replica/backend.md).
  return member;
}

// ------------------------------------------------------------- schedule

async function weekRows(tx: Tx, s: Session, weekStart: string) {
  const { start, end } = localRange(weekStart, 7, s.location.timezone);
  const [week] = await tx<ScheduleWeek[]>`select * from schedule_weeks where location_id = ${s.location.id} and week_start = ${weekStart}`;
  const shifts = await tx<Shift[]>`
    select * from shifts where location_id = ${s.location.id} and start_at >= ${start} and start_at < ${end} order by start_at`;
  return { week: week ?? null, shifts };
}

export async function getWeek(s: Session, weekStart: string) {
  managerOnly(s);
  return withUser(s.userId, (tx) => weekRows(tx, s, weekStart));
}

async function ensureWeek(tx: Tx, s: Session, weekStart: string): Promise<ScheduleWeek> {
  await tx`insert into schedule_weeks (company_id, location_id, week_start) values (${s.company.id}, ${s.location.id}, ${weekStart})
           on conflict (location_id, week_start) do nothing`;
  const [w] = await tx<ScheduleWeek[]>`select * from schedule_weeks where location_id = ${s.location.id} and week_start = ${weekStart}`;
  return w;
}

export async function createShift(s: Session, weekStart: string, input: {
  memberId: string | null; jobTitle: string | null; startAt: Date; endAt: Date; unpaidBreakMin: number; note: string | null;
}): Promise<Shift> {
  managerOnly(s);
  if (input.endAt <= input.startAt) throw new RuleError("invalid_range", "El turno tiene que terminar después de empezar.");
  if (input.endAt.getTime() - input.startAt.getTime() > 24 * 3600_000) throw new RuleError("too_long", "Un turno no puede durar más de 24 horas.");
  return withUser(s.userId, async (tx) => {
    let name = "";
    if (input.memberId) {
      const [m] = await tx<Member[]>`select ${tx.unsafe(MEMBER)} from members where id = ${input.memberId} and company_id = ${s.company.id}`;
      if (!m) throw new RuleError("not_found", "Esa persona no está en este equipo.");
      name = m.fullName;
    }
    const week = await ensureWeek(tx, s, weekStart);
    try {
      const [shift] = await tx<Shift[]>`
        insert into shifts (company_id, location_id, schedule_week_id, member_id, job_title, start_at, end_at, unpaid_break_min, note)
        values (${s.company.id}, ${s.location.id}, ${week.id}, ${input.memberId}, ${input.jobTitle}, ${input.startAt}, ${input.endAt},
                ${input.unpaidBreakMin}, ${input.note})
        returning *`;
      return shift;
    } catch (e) {
      if (pgCode(e) === "23P01") throw new RuleError("double_booked", `${name} ya tiene un turno a esa hora.`);
      throw e;
    }
  });
}

export async function deleteShift(s: Session, shiftId: string): Promise<void> {
  managerOnly(s);
  await withUser(s.userId, (tx) => tx`delete from shifts where id = ${shiftId} and company_id = ${s.company.id}`);
}

export async function copyWeek(s: Session, fromWeek: string, toWeek: string): Promise<number> {
  const { shifts } = await getWeek(s, fromWeek);
  const tz = s.location.timezone;
  const days = Math.round((Date.parse(toWeek) - Date.parse(fromWeek)) / 86_400_000);
  // Move by local calendar days so wall times survive a DST change between weeks.
  const move = (iso: string) => {
    const at = new Date(iso);
    return toInstant(addLocalDays(localDate(at, tz), days), localTime(at, tz), tz);
  };
  let created = 0;
  for (const x of shifts) {
    try {
      await createShift(s, toWeek, { memberId: x.memberId, jobTitle: x.jobTitle, note: x.note, unpaidBreakMin: x.unpaidBreakMin, startAt: move(x.startAt), endAt: move(x.endAt) });
      created++;
    } catch (e) {
      if (!(e instanceof RuleError)) throw e; // skip clashes with shifts already in the target week
    }
  }
  return created;
}

export async function publishWeek(s: Session, weekStart: string): Promise<{ notified: number }> {
  managerOnly(s);
  const people = await withUser(s.userId, async (tx) => {
    const week = await ensureWeek(tx, s, weekStart);
    const changed = await tx<{ memberId: string | null }[]>`
      update shifts set dirty = false, published_version = published_version + 1
      where schedule_week_id = ${week.id} and dirty returning member_id`;
    await tx`update schedule_weeks set status = 'published', published_at = now(), published_by = ${s.member.id} where id = ${week.id}`;
    const ids = [...new Set(changed.map((c) => c.memberId).filter((x): x is string => !!x))];
    if (ids.length === 0) return [];
    const members = await tx<Member[]>`select ${tx.unsafe(MEMBER)} from members where id = any(${ids}::uuid[])`;
    // Only people whose shifts changed are told; publishing again with no
    // changes notifies nobody.
    for (const m of members) {
      await tx`insert into notifications (company_id, member_id, kind, payload, channels)
               values (${s.company.id}, ${m.id}, 'schedule_published', ${tx.json({ weekStart })}, ${["email"]})`;
    }
    return members;
  });
  for (const m of people) {
    if (!m.email) continue; // push and SMS arrive with the Expo app and Twilio
    await sendEmail({
      to: m.email,
      subject: `Tu horario en ${s.company.name} ya está publicado`,
      text: `Hola ${m.fullName.split(" ")[0]},\n\n${s.member.fullName} publicó el horario de la semana del ${weekStart}. Míralo aquí: ${appUrl()}/clock\n`,
    });
  }
  return { notified: people.length };
}

export async function myPublishedShifts(s: Session, from: Date, to: Date): Promise<Shift[]> {
  return withUser(s.userId, (tx) => tx<Shift[]>`
    select * from shifts where member_id = ${s.member.id} and published_version > 0 and end_at > ${from} and start_at < ${to}
    order by start_at`);
}

// ------------------------------------------------------------- time clock

export async function openCard(s: Session): Promise<TimeCard | null> {
  return withUser(s.userId, async (tx) => {
    const [c] = await tx<TimeCard[]>`select * from time_cards where member_id = ${s.member.id} and clock_out_at is null`;
    return c ?? null;
  });
}

/**
 * Punches are written as system after the rules are checked here, because
 * employees must not be able to insert time cards directly.
 */
export async function clockIn(s: Session, at = new Date()): Promise<TimeCard> {
  return system(async (tx) => {
    const [open] = await tx`select 1 from time_cards where member_id = ${s.member.id} and clock_out_at is null`;
    const [next] = await tx<Shift[]>`
      select * from shifts where member_id = ${s.member.id} and published_version > 0
        and end_at > ${at} and start_at < ${new Date(at.getTime() + 12 * 3600_000)}
      order by start_at limit 1`;
    const started = next && new Date(next.startAt) <= at;
    const check = canClockIn({ now: at, hasOpenCard: !!open, nextShiftStart: next && !started ? new Date(next.startAt) : null, earlyClockInMinutes: s.location.earlyClockInMin });
    if (!check.ok) {
      if (check.reason === "already_clocked_in") throw new RuleError(check.reason, "Ya checaste entrada.");
      throw new RuleError(check.reason, check.allowedFrom.toISOString());
    }
    try {
      const [card] = await tx<TimeCard[]>`
        insert into time_cards (company_id, location_id, member_id, shift_id, wage_cents, clock_in_at, source)
        values (${s.company.id}, ${s.location.id}, ${s.member.id}, ${next?.id ?? null}, ${s.member.wageCents}, ${at}, 'web')
        returning *`;
      return card;
    } catch (e) {
      if (pgCode(e) === "23505") throw new RuleError("already_clocked_in", "Ya checaste entrada."); // double tap
      throw e;
    }
  });
}

export async function clockOut(s: Session, at = new Date()): Promise<TimeCard> {
  return system(async (tx) => {
    const [card] = await tx<TimeCard[]>`
      update time_cards set clock_out_at = greatest(${at}::timestamptz, clock_in_at + interval '1 minute')
      where member_id = ${s.member.id} and clock_out_at is null returning *`;
    if (!card) throw new RuleError("not_clocked_in", "No has checado entrada.");
    return card;
  });
}

export async function cardsInRange(s: Session, from: Date, to: Date): Promise<TimeCard[]> {
  managerOnly(s);
  return withUser(s.userId, (tx) => tx<TimeCard[]>`
    select * from time_cards where location_id = ${s.location.id} and clock_in_at >= ${from} and clock_in_at < ${to}`);
}

export async function approveCards(s: Session, ids: string[]): Promise<number> {
  managerOnly(s);
  if (ids.length === 0) return 0;
  return withUser(s.userId, async (tx) => {
    const rows = await tx`
      update time_cards set approved_at = now(), approved_by = ${s.member.id}
      where company_id = ${s.company.id} and id = any(${ids}::uuid[]) and clock_out_at is not null and approved_at is null
      returning id`;
    return rows.length;
  });
}

// ------------------------------------------------------------- billing

export async function subscriptionFor(s: Session): Promise<Subscription> {
  const [row] = await system((tx) => tx<Subscription[]>`select * from subscriptions where company_id = ${s.company.id}`);
  return row ?? { plan: "free", status: "active", locationQuantity: 1, currentPeriodEnd: null, stripeSubscriptionId: null };
}
