// Full departures and overbooking. A traveller can wait for a full departure;
// when a cancellation frees places (from any platform), the first person in
// line whose group fits is emailed a link to book. When platforms together
// sell more places than a tour has, managers are told at once and can stop
// selling that departure on Turno.
import "server-only";
import { system, withUser, type Tx } from "./db";
import { appUrl, sendEmail } from "./email";
import { departures, type Tour } from "./marketplace";
import type { Session } from "./types";
import { RuleError } from "./types";

const TOUR = "id, title, description, meeting_point, duration_min, capacity, price_model, price_cents, currency, published, max_people_per_booking, weekly_slots, sort";

export interface WaitRequest { slug: string; tourId: string; startsAt: string; name: string; email: string; people: number; language: "es" | "en" }

/** Join the line for a full departure. Refused while places are left: then the traveller should just book. */
export async function joinWaitlist(r: WaitRequest): Promise<void> {
  if (r.people < 1 || r.people > 50) throw new RuleError("people", "Indica cuántas personas sois (1 a 50).");
  await system(async (tx) => {
    const [p] = await tx<{ companyId: string; timezone: string }[]>`
      select gp.company_id, (select l.timezone from locations l where l.company_id = gp.company_id order by l.created_at limit 1) as timezone
      from guide_profiles gp where gp.slug = ${r.slug} and gp.published`;
    if (!p) throw new RuleError("not_found", "Esta página ya no está disponible.");
    const [tour] = await tx<Tour[]>`select ${tx.unsafe(TOUR)} from tours where id = ${r.tourId} and company_id = ${p.companyId} and published`;
    if (!tour) throw new RuleError("not_found", "Ese tour ya no está disponible.");
    const dep = (await departures(tour, p.companyId, p.timezone, 60)).find((d) => d.startsAt === new Date(r.startsAt).toISOString());
    if (!dep) throw new RuleError("slot", "Esa salida ya no está disponible.");
    if (dep.left >= r.people) throw new RuleError("open", "¡Todavía hay plazas! Puedes reservar directamente.");
    await tx`insert into waitlist (company_id, tour_id, starts_at, name, email, people, language)
             values (${p.companyId}, ${tour.id}, ${dep.startsAt}, ${r.name}, ${r.email}, ${r.people}, ${r.language})
             on conflict (tour_id, starts_at, email) do update set people = excluded.people, name = excluded.name, notified_at = null`;
  });
}

/**
 * After a cancellation: email the first waiting traveller whose group now fits.
 * Returns the email notified, if any. Each person is told once per opening.
 */
export async function notifyWaitlist(companyId: string, tourName: string | null, startsAt: string): Promise<string | null> {
  if (!tourName) return null;
  const hit = await system(async (tx) => {
    const [tour] = await tx<(Tour & { slug: string; companyName: string; timezone: string })[]>`
      select ${tx.unsafe(TOUR.split(", ").map((c) => "t." + c).join(", "))}, gp.slug, c.name as company_name,
             (select l.timezone from locations l where l.company_id = t.company_id order by l.created_at limit 1) as timezone
      from tours t join guide_profiles gp on gp.company_id = t.company_id join companies c on c.id = t.company_id
      where t.company_id = ${companyId} and t.title = ${tourName}`;
    if (!tour) return null;
    const left = await placesLeft(tx, companyId, tour, startsAt);
    if (left <= 0) return null;
    const [w] = await tx<{ id: string; name: string; email: string; people: number; language: "es" | "en" }[]>`
      select id, name, email, people, language from waitlist
      where tour_id = ${tour.id} and starts_at = ${startsAt} and notified_at is null and people <= ${left}
      order by created_at limit 1 for update skip locked`;
    if (!w) return null;
    await tx`update waitlist set notified_at = now() where id = ${w.id}`;
    return { w, tour, left };
  });
  if (!hit) return null;
  const { w, tour } = hit;
  const en = w.language === "en";
  const when = new Intl.DateTimeFormat(en ? "en-GB" : "es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tour.timezone }).format(new Date(startsAt));
  const link = `${appUrl()}/g/${tour.slug}?lang=${w.language}#tour-${tour.id}`;
  await sendEmail({
    to: w.email,
    subject: en ? `A place opened up: ${tour.title}` : `Se liberó una plaza: ${tour.title}`,
    text: en
      ? `Hi ${w.name.split(" ")[0]},\n\nGood news: places opened up on ${tour.title} (${when}) with ${tour.companyName}.\nBook them before someone else does: ${link}\n`
      : `Hola ${w.name.split(" ")[0]},\n\nBuenas noticias: se liberaron plazas en ${tour.title} (${when}) con ${tour.companyName}.\nResérvalas antes que otra persona: ${link}\n`,
  });
  return w.email;
}

async function placesLeft(tx: Tx, companyId: string, tour: Tour, startsAt: string): Promise<number> {
  const [{ taken }] = await tx<{ taken: number }[]>`select coalesce(sum(people), 0)::int as taken from bookings
    where company_id = ${companyId} and status <> 'cancelled' and coalesce(tour_name, '') = ${tour.title} and starts_at = ${startsAt}`;
  return tour.capacity - taken;
}

export interface Overbooking { tourId: string; tourName: string; startsAt: string; people: number; capacity: number; closed: boolean; platforms: string[] }

/** Departures where the platforms together sold more places than the tour has. */
export async function overbookings(s: Session, from: Date, to: Date): Promise<Overbooking[]> {
  return withUser(s.userId, (tx) => overbookedIn(tx, s.company.id, from, to));
}

async function overbookedIn(tx: Tx, companyId: string, from: Date, to: Date, only?: { startsAt: string; tourName: string }): Promise<Overbooking[]> {
  return tx<Overbooking[]>`
    select t.id as tour_id, t.title as tour_name, b.starts_at, sum(b.people)::int as people, t.capacity,
           exists (select 1 from departure_closures dc where dc.tour_id = t.id and dc.starts_at = b.starts_at) as closed,
           array_agg(distinct b.platform) as platforms
    from bookings b join tours t on t.company_id = b.company_id and t.title = b.tour_name
    where b.company_id = ${companyId} and b.status <> 'cancelled' and b.starts_at >= ${from} and b.starts_at < ${to}
      ${only ? tx`and b.starts_at = ${only.startsAt} and b.tour_name = ${only.tourName}` : tx``}
    group by t.id, t.title, t.capacity, b.starts_at
    having sum(b.people) > t.capacity
    order by b.starts_at`;
}

/** Right after a booking arrives: if that departure is now over capacity, email the managers once per new booking. */
export async function alertIfOverbooked(companyId: string, startsAt: string, tourName: string | null): Promise<Overbooking | null> {
  if (!tourName) return null;
  const found = await system(async (tx) => {
    const [o] = await overbookedIn(tx, companyId, new Date(startsAt), new Date(new Date(startsAt).getTime() + 1), { startsAt, tourName });
    if (!o) return null;
    const managers = await tx<{ email: string }[]>`select email from members where company_id = ${companyId} and role in ('owner','manager') and status <> 'archived' and email is not null`;
    const [{ timezone }] = await tx<{ timezone: string }[]>`select timezone from locations where company_id = ${companyId} order by created_at limit 1`;
    return { o, managers, timezone };
  });
  if (!found) return null;
  const when = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: found.timezone }).format(new Date(startsAt));
  for (const m of found.managers) {
    await sendEmail({
      to: m.email,
      subject: `Sobreventa: ${found.o.tourName}, ${when}`,
      text: `${found.o.tourName} (${when}) tiene ${found.o.people} personas para ${found.o.capacity} plazas, sumando todas tus plataformas.\n\nCierra esa salida en las plataformas que todavía la venden, o súbele el cupo si podéis llevar a todos.\nVer en Turno: ${appUrl()}/inicio\n`,
    });
  }
  return found.o;
}

/** Stop (or resume) selling one departure on Turno. */
export async function setDepartureClosed(s: Session, tourId: string, startsAt: string, closed: boolean): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede cerrar salidas.");
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) throw new RuleError("invalid", "Salida no válida.");
  await withUser(s.userId, async (tx) => {
    const [t] = await tx`select 1 from tours where id = ${tourId} and company_id = ${s.company.id}`;
    if (!t) throw new RuleError("not_found", "Ese tour no existe.");
    if (closed) await tx`insert into departure_closures (company_id, tour_id, starts_at) values (${s.company.id}, ${tourId}, ${at}) on conflict do nothing`;
    else await tx`delete from departure_closures where tour_id = ${tourId} and starts_at = ${at}`;
  });
}

/** Waiting travellers per departure, for the manager's calendar. */
export async function waitingCounts(s: Session, from: Date, to: Date): Promise<{ tourName: string; startsAt: string; people: number }[]> {
  return withUser(s.userId, (tx) => tx<{ tourName: string; startsAt: string; people: number }[]>`
    select t.title as tour_name, w.starts_at, sum(w.people)::int as people from waitlist w join tours t on t.id = w.tour_id
    where w.company_id = ${s.company.id} and w.starts_at >= ${from} and w.starts_at < ${to} and w.notified_at is null
    group by t.title, w.starts_at`);
}
