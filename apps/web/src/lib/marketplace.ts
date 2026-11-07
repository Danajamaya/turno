// The public side: a business's profile page with its tours and packages,
// open departures for the next weeks and bookings made on Turno. Sales on
// Turno carry Turno's commission (by plan); other platforms' bookings never do.
import "server-only";
import { randomBytes } from "node:crypto";
import { addLocalDays, commissionCents, localDate, toInstant, weekday } from "@turno/core";
import { system, withUser } from "./db";
import { sendEmail } from "./email";
import type { Session } from "./types";
import { RuleError } from "./types";

export interface Profile { companyId: string; slug: string; headline: string; bio: string; city: string; languages: string[]; specialities: string[]; videoUrl: string | null; published: boolean }
export interface Slot { weekday: number; time: string }
export interface Tour {
  id: string; title: string; description: string | null; meetingPoint: string | null; durationMin: number; capacity: number;
  priceModel: "free_tip" | "per_person" | "per_group"; priceCents: number; currency: string; published: boolean;
  maxPeoplePerBooking: number; weeklySlots: Slot[]; sort: number;
}
export interface Departure { startsAt: string; date: string; time: string; left: number }

const TOUR = "id, title, description, meeting_point, duration_min, capacity, price_model, price_cents, currency, published, max_people_per_booking, weekly_slots, sort";
const managerOnly = (s: Session) => { if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede hacer esto."); };

// ------------------------------------------------------------- owner side

export async function getProfile(s: Session): Promise<Profile | null> {
  const [p] = await withUser(s.userId, (tx) => tx<Profile[]>`select * from guide_profiles where company_id = ${s.company.id}`);
  return p ?? null;
}

export async function saveProfile(s: Session, p: Omit<Profile, "companyId">): Promise<void> {
  managerOnly(s);
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(p.slug)) throw new RuleError("slug", "La dirección solo puede tener letras sin acentos, números y guiones (3 a 41).");
  try {
    await withUser(s.userId, (tx) => tx`
      insert into guide_profiles (company_id, slug, headline, bio, city, languages, specialities, video_url, published)
      values (${s.company.id}, ${p.slug}, ${p.headline}, ${p.bio}, ${p.city}, ${p.languages}, ${p.specialities}, ${p.videoUrl}, ${p.published})
      on conflict (company_id) do update set slug = excluded.slug, headline = excluded.headline, bio = excluded.bio, city = excluded.city,
        languages = excluded.languages, specialities = excluded.specialities, video_url = excluded.video_url, published = excluded.published`);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new RuleError("slug_taken", "Esa dirección ya la usa otro negocio. Prueba otra.");
    throw e;
  }
}

export async function listTours(s: Session): Promise<Tour[]> {
  return withUser(s.userId, (tx) => tx<Tour[]>`select ${tx.unsafe(TOUR)} from tours where company_id = ${s.company.id} order by sort, created_at`);
}

export async function saveTour(s: Session, t: Omit<Tour, "id" | "currency" | "sort"> & { id?: string }): Promise<string> {
  managerOnly(s);
  if (t.priceModel !== "free_tip" && t.priceCents <= 0) throw new RuleError("price", "Pon un precio, o elige «A la voluntad».");
  const slots = t.weeklySlots.filter((x) => x.weekday >= 0 && x.weekday <= 6 && /^\d{2}:\d{2}$/.test(x.time)).slice(0, 28);
  return withUser(s.userId, async (tx) => {
    const values = { title: t.title, description: t.description, meetingPoint: t.meetingPoint, durationMin: t.durationMin, capacity: t.capacity,
      priceModel: t.priceModel, priceCents: t.priceModel === "free_tip" ? 0 : t.priceCents, published: t.published, maxPeoplePerBooking: t.maxPeoplePerBooking };
    if (t.id) {
      const [row] = await tx<{ id: string }[]>`update tours set title = ${values.title}, description = ${values.description}, meeting_point = ${values.meetingPoint},
        duration_min = ${values.durationMin}, capacity = ${values.capacity}, price_model = ${values.priceModel}, price_cents = ${values.priceCents},
        published = ${values.published}, max_people_per_booking = ${values.maxPeoplePerBooking}, weekly_slots = ${tx.json(slots as never)}
        where id = ${t.id} and company_id = ${s.company.id} returning id`;
      if (!row) throw new RuleError("not_found", "Ese tour no existe.");
      return row.id;
    }
    const [row] = await tx<{ id: string }[]>`insert into tours (company_id, location_id, title, description, meeting_point, duration_min, capacity, price_model,
        price_cents, currency, published, max_people_per_booking, weekly_slots)
      values (${s.company.id}, ${s.location.id}, ${values.title}, ${values.description}, ${values.meetingPoint}, ${values.durationMin}, ${values.capacity},
        ${values.priceModel}, ${values.priceCents}, ${s.company.currency}, ${values.published}, ${values.maxPeoplePerBooking}, ${tx.json(slots as never)})
      returning id`;
    return row.id;
  });
}

export async function deleteTour(s: Session, id: string): Promise<void> {
  managerOnly(s);
  await withUser(s.userId, (tx) => tx`delete from tours where id = ${id} and company_id = ${s.company.id}`);
}

// ------------------------------------------------------------- public side

export async function publicProfile(slug: string) {
  return system(async (tx) => {
    const [p] = await tx<(Profile & { companyName: string; timezone: string; currency: string })[]>`
      select gp.*, c.name as company_name, c.currency,
             (select l.timezone from locations l where l.company_id = c.id order by l.created_at limit 1) as timezone
      from guide_profiles gp join companies c on c.id = gp.company_id where gp.slug = ${slug} and gp.published`;
    if (!p) return null;
    const tours = await tx<Tour[]>`select ${tx.unsafe(TOUR)} from tours where company_id = ${p.companyId} and published order by sort, created_at`;
    const [stats] = await tx<{ travellers: number; tours: number }[]>`
      select coalesce(sum(people) filter (where status = 'attended'), 0)::int as travellers, count(distinct starts_at)::int as tours
      from bookings where company_id = ${p.companyId}`;
    return { ...p, tours, stats };
  });
}

/** Open departures of a tour for the next `days`, with places left (bookings from every platform count). */
export async function departures(tour: Tour & { companyId?: string }, companyId: string, tz: string, days = 14, now = new Date()): Promise<Departure[]> {
  const today = localDate(now, tz);
  const list: Departure[] = [];
  for (let i = 0; i < days; i++) {
    const date = addLocalDays(today, i);
    for (const slot of tour.weeklySlots.filter((x) => x.weekday === weekday(date))) {
      const at = toInstant(date, slot.time, tz);
      if (at.getTime() < now.getTime() + 60 * 60_000) continue; // bookable until an hour before
      list.push({ startsAt: at.toISOString(), date, time: slot.time, left: tour.capacity });
    }
  }
  if (list.length === 0) return list;
  const taken = await system((tx) => tx<{ startsAt: string; people: number }[]>`
    select starts_at, sum(people)::int as people from bookings
    where company_id = ${companyId} and status <> 'cancelled' and coalesce(tour_name, '') = ${tour.title}
      and starts_at = any(${list.map((d) => d.startsAt)}::timestamptz[]) group by starts_at`);
  for (const d of list) d.left = Math.max(0, tour.capacity - (taken.find((t) => t.startsAt === d.startsAt)?.people ?? 0));
  return list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export interface BookingRequest { slug: string; tourId: string; startsAt: string; people: number; name: string; email: string; phone: string | null; language: string | null }

/** A traveller books on Turno. Capacity is re-checked inside the transaction, under a lock. */
export async function book(r: BookingRequest): Promise<{ code: string }> {
  const code = "T-" + randomBytes(4).toString("hex").toUpperCase();
  const result = await system(async (tx) => {
    const [p] = await tx<{ companyId: string; companyName: string; timezone: string }[]>`
      select gp.company_id, c.name as company_name, (select l.timezone from locations l where l.company_id = c.id order by l.created_at limit 1) as timezone
      from guide_profiles gp join companies c on c.id = gp.company_id where gp.slug = ${r.slug} and gp.published`;
    if (!p) throw new RuleError("not_found", "Esta página ya no está disponible.");
    const [tour] = await tx<Tour[]>`select ${tx.unsafe(TOUR)} from tours where id = ${r.tourId} and company_id = ${p.companyId} and published for update`;
    if (!tour) throw new RuleError("not_found", "Ese tour ya no está disponible.");
    if (r.people < 1 || r.people > tour.maxPeoplePerBooking) throw new RuleError("people", `Puedes reservar de 1 a ${tour.maxPeoplePerBooking} personas.`);
    const open = await departures(tour, p.companyId, p.timezone, 60);
    const dep = open.find((d) => d.startsAt === new Date(r.startsAt).toISOString());
    if (!dep) throw new RuleError("slot", "Esa salida ya no está disponible. Elige otra.");
    const [{ taken }] = await tx<{ taken: number }[]>`select coalesce(sum(people), 0)::int as taken from bookings
      where company_id = ${p.companyId} and status <> 'cancelled' and coalesce(tour_name, '') = ${tour.title} and starts_at = ${dep.startsAt}`;
    if (taken + r.people > tour.capacity) throw new RuleError("full", tour.capacity - taken > 0 ? `Solo quedan ${tour.capacity - taken} plazas.` : "Esa salida ya está completa.");
    const gross = tour.priceModel === "per_person" ? tour.priceCents * r.people : tour.priceModel === "per_group" ? tour.priceCents : 0;
    const [{ plan }] = await tx<{ plan: string }[]>`select coalesce((select plan from subscriptions where company_id = ${p.companyId}), 'free') as plan`;
    const [settings] = await tx<{ commissionBpsFree: number; commissionBpsPaid: number; commissionBpsPlus: number }[]>`select commission_bps_free, commission_bps_paid, commission_bps_plus from platform_settings`;
    const commission = commissionCents(gross, plan === "plus" ? settings.commissionBpsPlus : plan === "essentials" ? settings.commissionBpsPaid : settings.commissionBpsFree);
    const [channel] = await tx<{ id: string }[]>`insert into channels (company_id, platform, method, last_event_at) values (${p.companyId}, 'turno', 'marketplace', now())
      on conflict (company_id, platform, method) do update set last_event_at = now() returning id`;
    const [traveller] = await tx<{ id: string }[]>`insert into travellers (company_id, name, email, phone, language, first_platform)
      values (${p.companyId}, ${r.name}, ${r.email}, ${r.phone}, ${r.language}, 'turno')
      on conflict (company_id, lower(email)) where email is not null do update set name = excluded.name, phone = coalesce(excluded.phone, travellers.phone)
      returning id`;
    await tx`insert into bookings (company_id, channel_id, platform, external_ref, tour_id, tour_name, traveller_id, starts_at, people, status, gross_cents,
        turno_commission_cents, currency, payment)
      values (${p.companyId}, ${channel.id}, 'turno', ${code}, ${tour.id}, ${tour.title}, ${traveller.id}, ${dep.startsAt}, ${r.people}, 'confirmed', ${gross},
        ${commission}, ${tour.currency}, ${gross > 0 ? "on_site" : "free"})`;
    return { tour, dep, gross, companyName: p.companyName, timezone: p.timezone };
  });
  const when = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: result.timezone }).format(new Date(result.dep.startsAt));
  await sendEmail({
    to: r.email,
    subject: `Reserva confirmada: ${result.tour.title}`,
    text: `Hola ${r.name.split(" ")[0]},\n\nTu reserva con ${result.companyName} está confirmada.\n\n${result.tour.title}\n${when}\n${r.people} ${r.people === 1 ? "persona" : "personas"}\nPunto de encuentro: ${result.tour.meetingPoint ?? "te lo enviamos antes del tour"}\nCódigo: ${code}\n\n${result.gross > 0 ? "Pagas en el punto de encuentro." : "Es un tour a la voluntad: al final pagas lo que te parezca justo."}\n`,
  });
  return { code };
}

export async function bookingByCode(slug: string, code: string) {
  return system(async (tx) => {
    const [b] = await tx<{ tourName: string; startsAt: string; people: number; grossCents: number; currency: string; payment: string; meetingPoint: string | null; companyName: string; timezone: string; status: string }[]>`
      select b.tour_name, b.starts_at, b.people, b.gross_cents, b.currency, b.payment, b.status, t.meeting_point, c.name as company_name,
             (select l.timezone from locations l where l.company_id = c.id order by l.created_at limit 1) as timezone
      from bookings b join guide_profiles gp on gp.company_id = b.company_id join companies c on c.id = b.company_id left join tours t on t.id = b.tour_id
      where gp.slug = ${slug} and b.platform = 'turno' and b.external_ref = ${code}`;
    return b ?? null;
  });
}

// ------------------------------------------------------------- search

export interface SearchHit { slug: string; companyName: string; headline: string; city: string; languages: string[]; specialities: string[]; fromCents: number | null; currency: string; hasFree: boolean; rating: number | null; reviews: number; tours: number }

/** Published businesses by city, language, interest and (optionally) a day with a departure. */
export async function search(q: { city?: string; language?: string; interest?: string; date?: string }): Promise<SearchHit[]> {
  const wd = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? weekday(q.date) : null;
  return system((tx) => tx<SearchHit[]>`
    select gp.slug, c.name as company_name, gp.headline, gp.city, gp.languages, gp.specialities, c.currency,
           min(t.price_cents) filter (where t.price_model <> 'free_tip') as from_cents,
           bool_or(t.price_model = 'free_tip') as has_free, count(distinct t.id)::int as tours,
           (select round(avg(r.rating)::numeric, 1)::float from reviews r where r.company_id = gp.company_id and r.submitted_at is not null) as rating,
           (select count(*)::int from reviews r where r.company_id = gp.company_id and r.submitted_at is not null) as reviews
    from guide_profiles gp join companies c on c.id = gp.company_id join tours t on t.company_id = gp.company_id and t.published
    where gp.published
      ${q.city?.trim() ? tx`and unaccent_lower(gp.city) like ${"%" + q.city.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "%"}` : tx``}
      ${q.language?.trim() ? tx`and exists (select 1 from unnest(gp.languages) l where lower(l) = lower(${q.language.trim()}))` : tx``}
      ${q.interest?.trim() ? tx`and exists (select 1 from unnest(gp.specialities) x where lower(x) = lower(${q.interest.trim()}))` : tx``}
      ${wd !== null ? tx`and exists (select 1 from tours t2, jsonb_array_elements(t2.weekly_slots) sl where t2.company_id = gp.company_id and t2.published and (sl->>'weekday')::int = ${wd})` : tx``}
    group by gp.company_id, gp.slug, c.name, gp.headline, gp.city, gp.languages, gp.specialities, c.currency
    order by rating desc nulls last, tours desc limit 60`);
}

export async function searchFacets() {
  return system(async (tx) => {
    const [f] = await tx<{ cities: string[]; languages: string[]; interests: string[] }[]>`
      select coalesce(array_agg(distinct gp.city) filter (where gp.city <> ''), '{}') as cities,
             coalesce((select array_agg(distinct l) from guide_profiles g2, unnest(g2.languages) l where g2.published), '{}') as languages,
             coalesce((select array_agg(distinct x) from guide_profiles g3, unnest(g3.specialities) x where g3.published), '{}') as interests
      from guide_profiles gp where gp.published`;
    return f;
  });
}

export interface TourHit {
  tourId: string; title: string; description: string | null; durationMin: number; priceModel: Tour["priceModel"]; priceCents: number; currency: string;
  firstTime: string | null; slug: string; companyName: string; city: string; languages: string[]; specialities: string[]; rating: number | null; reviews: number;
}

/** Published tours, Airbnb-experience style, with the same filters as the guide search. */
export async function searchTours(q: { city?: string; language?: string; interest?: string; date?: string }): Promise<TourHit[]> {
  const slugs = (await search(q)).map((h) => h.slug);
  if (slugs.length === 0) return [];
  const wd = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? weekday(q.date) : null;
  return system((tx) => tx<TourHit[]>`
    select t.id as tour_id, t.title, t.description, t.duration_min, t.price_model, t.price_cents, t.currency,
           (select min(sl->>'time') from jsonb_array_elements(t.weekly_slots) sl ${wd !== null ? tx`where (sl->>'weekday')::int = ${wd}` : tx``}) as first_time,
           gp.slug, c.name as company_name, gp.city, gp.languages, gp.specialities,
           (select round(avg(r.rating)::numeric, 1)::float from reviews r where r.company_id = gp.company_id and r.submitted_at is not null) as rating,
           (select count(*)::int from reviews r where r.company_id = gp.company_id and r.submitted_at is not null) as reviews
    from tours t join guide_profiles gp on gp.company_id = t.company_id join companies c on c.id = t.company_id
    where t.published and gp.slug = any(${slugs})
      ${wd !== null ? tx`and exists (select 1 from jsonb_array_elements(t.weekly_slots) sl where (sl->>'weekday')::int = ${wd})` : tx``}
    order by array_position(${slugs}::text[], gp.slug), t.sort, t.created_at limit 120`);
}
