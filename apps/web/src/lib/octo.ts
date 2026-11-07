// A supplier API in the shape of OCTO (octo.travel), the open standard that
// GetYourGuide, Viator and other resellers use with reservation systems.
// Each reseller gets its own key per business; bookings it confirms land in the
// calendar with that platform's name and no Turno commission, exactly like
// email imports, and count against the same capacity (holds included).
// Going live with a reseller still needs their certification of this endpoint.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { addLocalDays, localDate, toInstant, weekday } from "@turno/core";
import { system, withUser, type Tx } from "./db";
import type { Tour } from "./marketplace";
import type { Session } from "./types";
import { RuleError } from "./types";

const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");
const HOLD_MIN = 30;
export const OCTO_PLATFORMS = ["getyourguide", "viator", "civitatis", "other"] as const;

// ------------------------------------------------------------- keys (managers)

export async function createApiKey(s: Session, platform: string, label: string): Promise<string> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede crear claves.");
  if (!(OCTO_PLATFORMS as readonly string[]).includes(platform)) throw new RuleError("platform", "Elige una plataforma.");
  const key = `turno_${randomBytes(24).toString("base64url")}`;
  await withUser(s.userId, (tx) => tx`insert into api_keys (company_id, platform, label, key_hash) values (${s.company.id}, ${platform}, ${label.trim().slice(0, 60) || platform}, ${hashKey(key)})`);
  return key; // shown once
}

export async function apiKeys(s: Session) {
  if (s.member.role === "employee") return [];
  return withUser(s.userId, (tx) => tx<{ id: string; platform: string; label: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }[]>`
    select id, platform, label, last_used_at, revoked_at, created_at from api_keys where company_id = ${s.company.id} order by created_at desc`);
}

export async function revokeApiKey(s: Session, id: string): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede revocar claves.");
  await withUser(s.userId, (tx) => tx`update api_keys set revoked_at = now() where id = ${id} and company_id = ${s.company.id} and revoked_at is null`);
}

// ------------------------------------------------------------- the API

export class OctoError extends Error { constructor(public status: number, public error: string, message: string) { super(message); } }
export interface Caller { keyId: string; companyId: string; platform: string; timezone: string }

export async function authenticate(header: string | null): Promise<Caller> {
  const key = header?.replace(/^Bearer\s+/i, "").trim();
  if (!key) throw new OctoError(401, "UNAUTHORIZED", "Missing API key");
  const [k] = await system((tx) => tx<Caller[]>`update api_keys k set last_used_at = now() from companies c
    where k.key_hash = ${hashKey(key)} and k.revoked_at is null and c.id = k.company_id
    returning k.id as key_id, k.company_id, k.platform, (select timezone from locations where company_id = c.id order by created_at limit 1) as timezone`);
  if (!k) throw new OctoError(401, "UNAUTHORIZED", "Invalid API key");
  return k;
}

const TOUR = "id, title, description, meeting_point, duration_min, capacity, price_model, price_cents, currency, published, max_people_per_booking, weekly_slots, sort";

function product(t: Tour, tz: string) {
  return {
    id: t.id, internalName: t.title, reference: t.id.slice(0, 8), locale: "es", timeZone: tz, allowFreesale: false, instantConfirmation: true, instantDelivery: true,
    availabilityRequired: true, availabilityType: "START_TIME", deliveryFormats: ["QRCODE"], deliveryMethods: ["VOUCHER"], redemptionMethod: "DIGITAL",
    options: [{ id: "DEFAULT", default: true, internalName: "Default", reference: null, availabilityLocalStartTimes: [...new Set(t.weeklySlots.map((x) => x.time))].sort(),
      cancellationCutoff: "0 hours", cancellationCutoffAmount: 0, cancellationCutoffUnit: "hour", requiredContactFields: ["fullName"], restrictions: { minUnits: 1, maxUnits: t.maxPeoplePerBooking },
      units: [{ id: "adult", internalName: "Adult", reference: "adult", type: "ADULT", requiredContactFields: [], restrictions: { minAge: 0, maxAge: 120, idRequired: false, minQuantity: null, maxQuantity: null, paxCount: 1, accompaniedBy: [] } }] }],
  };
}

export async function products(c: Caller) {
  const tours = await system((tx) => tx<Tour[]>`select ${tx.unsafe(TOUR)} from tours where company_id = ${c.companyId} and published order by sort, created_at`);
  return tours.map((t) => product(t, c.timezone));
}

async function tourFor(tx: Tx, c: Caller, productId: string): Promise<Tour> {
  if (!/^[0-9a-f-]{36}$/.test(productId)) throw new OctoError(400, "INVALID_PRODUCT_ID", "Unknown product");
  const [t] = await tx<Tour[]>`select ${tx.unsafe(TOUR)} from tours where id = ${productId} and company_id = ${c.companyId} and published`;
  if (!t) throw new OctoError(400, "INVALID_PRODUCT_ID", "Unknown product");
  return t;
}

/** Places taken at a departure: bookings from every platform plus live holds. */
async function taken(tx: Tx, c: Caller, t: Tour, startsAt: string): Promise<number> {
  const [{ n }] = await tx<{ n: number }[]>`select (
      coalesce((select sum(people) from bookings where company_id = ${c.companyId} and status <> 'cancelled' and coalesce(tour_name, '') = ${t.title} and starts_at = ${startsAt}), 0)
    + coalesce((select sum(people) from octo_holds where tour_id = ${t.id} and starts_at = ${startsAt} and status = 'ON_HOLD' and expires_at > now()), 0))::int as n`;
  const [closed] = await tx`select 1 from departure_closures where tour_id = ${t.id} and starts_at = ${startsAt}`;
  return closed ? t.capacity : n;
}

const localIso = (at: Date, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${(p.timeZoneName as string).replace("GMT", "") || "+00:00"}`;
};

export async function availability(c: Caller, q: { productId: string; optionId?: string; localDateStart?: string; localDateEnd?: string; availabilityIds?: string[] }) {
  return system(async (tx) => {
    const t = await tourFor(tx, c, q.productId);
    const from = q.localDateStart ?? localDate(new Date(), c.timezone), to = q.localDateEnd ?? from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new OctoError(400, "BAD_REQUEST", "Invalid dates");
    const out = [];
    for (let d = from, i = 0; d <= to && i < 92; d = addLocalDays(d, 1), i++) {
      for (const slot of t.weeklySlots.filter((x) => x.weekday === weekday(d))) {
        const at = toInstant(d, slot.time, c.timezone);
        if (at.getTime() < Date.now()) continue;
        const iso = at.toISOString(), left = Math.max(0, t.capacity - await taken(tx, c, t, iso));
        const id = localIso(at, c.timezone);
        if (q.availabilityIds && !q.availabilityIds.includes(id)) continue;
        out.push({ id, localDateTimeStart: id, localDateTimeEnd: localIso(new Date(at.getTime() + t.durationMin * 60_000), c.timezone), allDay: false, available: left > 0,
          status: left === 0 ? "SOLD_OUT" : left < t.capacity * 0.2 ? "LIMITED" : "AVAILABLE", vacancies: left, capacity: t.capacity, maxUnits: Math.min(left, t.maxPeoplePerBooking),
          utcCutoffAt: iso, openingHours: [] });
      }
    }
    return out;
  });
}

type Hold = { id: string; tourId: string; startsAt: string; people: number; status: string; resellerReference: string | null; expiresAt: string; bookingId: string | null };

function bookingObject(h: Hold, t: Tour, tz: string, contact?: { fullName?: string; emailAddress?: string; phoneNumber?: string }) {
  return {
    id: h.id, uuid: h.id, testMode: false, resellerReference: h.resellerReference, supplierReference: h.bookingId ? `TUR-${h.id.slice(0, 8).toUpperCase()}` : null,
    status: h.status, utcCreatedAt: null, utcUpdatedAt: new Date().toISOString(), utcExpiresAt: h.status === "ON_HOLD" ? new Date(h.expiresAt).toISOString() : null,
    utcRedeemedAt: null, utcConfirmedAt: h.status === "CONFIRMED" ? new Date().toISOString() : null, productId: t.id, product: product(t, tz), optionId: "DEFAULT",
    availabilityId: localIso(new Date(h.startsAt), tz), availability: { id: localIso(new Date(h.startsAt), tz), localDateTimeStart: localIso(new Date(h.startsAt), tz), allDay: false },
    contact: { fullName: contact?.fullName ?? null, emailAddress: contact?.emailAddress ?? null, phoneNumber: contact?.phoneNumber ?? null },
    unitItems: Array.from({ length: h.people }, (_, i) => ({ uuid: `${h.id}-${i}`, unitId: "adult", status: h.status })), deliveryMethods: ["VOUCHER"], voucher: null,
  };
}

/** Reserve (ON_HOLD) for 30 minutes: holds count against capacity until confirmed, cancelled or expired. */
export async function reserve(c: Caller, body: { productId: string; optionId?: string; availabilityId: string; unitItems: { unitId: string }[]; resellerReference?: string; expirationMinutes?: number }) {
  return system(async (tx) => {
    const t = await tourFor(tx, c, body.productId);
    await tx`select id from tours where id = ${t.id} for update`; // one reservation at a time per tour
    const at = new Date(body.availabilityId ?? "");
    const people = Array.isArray(body.unitItems) ? body.unitItems.length : 0;
    if (Number.isNaN(at.getTime())) throw new OctoError(400, "INVALID_AVAILABILITY_ID", "Unknown availability");
    if (people < 1 || people > t.maxPeoplePerBooking) throw new OctoError(400, "INVALID_UNIT_ITEMS", `Book 1 to ${t.maxPeoplePerBooking} units`);
    const local = localDate(at, c.timezone), time = new Intl.DateTimeFormat("en-GB", { timeZone: c.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
    if (!t.weeklySlots.some((x) => x.weekday === weekday(local) && x.time === time) || at.getTime() < Date.now()) throw new OctoError(400, "INVALID_AVAILABILITY_ID", "Unknown availability");
    if (t.capacity - await taken(tx, c, t, at.toISOString()) < people) throw new OctoError(400, "UNPROCESSABLE_ENTITY", "Not enough vacancies");
    const minutes = Math.min(Math.max(Number(body.expirationMinutes) || HOLD_MIN, 5), 60);
    const [h] = await tx<Hold[]>`insert into octo_holds (company_id, api_key_id, tour_id, starts_at, people, reseller_reference, expires_at)
      values (${c.companyId}, ${c.keyId}, ${t.id}, ${at}, ${people}, ${body.resellerReference?.slice(0, 100) ?? null}, ${new Date(Date.now() + minutes * 60_000)})
      returning id, tour_id, starts_at, people, status, reseller_reference, expires_at, booking_id`;
    return bookingObject(h, t, c.timezone);
  });
}

async function holdFor(tx: Tx, c: Caller, uuid: string): Promise<{ h: Hold; t: Tour }> {
  if (!/^[0-9a-f-]{36}$/.test(uuid)) throw new OctoError(400, "INVALID_BOOKING_UUID", "Unknown booking");
  const [h] = await tx<Hold[]>`select id, tour_id, starts_at, people, status, reseller_reference, expires_at, booking_id from octo_holds
    where id = ${uuid} and company_id = ${c.companyId} and api_key_id = ${c.keyId} for update`;
  if (!h) throw new OctoError(400, "INVALID_BOOKING_UUID", "Unknown booking");
  const [t] = await tx<Tour[]>`select ${tx.unsafe(TOUR)} from tours where id = ${h.tourId}`;
  return { h, t };
}

export async function getBooking(c: Caller, uuid: string) {
  return system(async (tx) => { const { h, t } = await holdFor(tx, c, uuid); return bookingObject(h, t, c.timezone); });
}

/** Confirm: the hold becomes a booking in the calendar under the reseller's platform. Idempotent. */
export async function confirm(c: Caller, uuid: string, body: { resellerReference?: string; contact?: { fullName?: string; emailAddress?: string; phoneNumber?: string; locales?: string[] } }) {
  const result = await system(async (tx) => {
    const { h, t } = await holdFor(tx, c, uuid);
    if (h.status === "CONFIRMED") return { obj: bookingObject(h, t, c.timezone, body.contact), bookingId: null };
    if (h.status !== "ON_HOLD" || new Date(h.expiresAt) < new Date()) throw new OctoError(400, "BAD_REQUEST", "Booking is not on hold");
    const contact = body.contact ?? {};
    let travellerId: string | null = null;
    if (contact.fullName || contact.emailAddress || contact.phoneNumber) {
      const lang = contact.locales?.[0]?.slice(0, 2) === "en" ? "en" : contact.locales?.[0]?.slice(0, 2) === "es" ? "es" : null;
      const [tr] = contact.emailAddress
        ? await tx<{ id: string }[]>`insert into travellers (company_id, name, email, phone, language, first_platform) values (${c.companyId}, ${contact.fullName ?? ""}, ${contact.emailAddress}, ${contact.phoneNumber ?? null}, ${lang}, ${c.platform})
            on conflict (company_id, lower(email)) where email is not null do update set phone = coalesce(travellers.phone, excluded.phone) returning id`
        : await tx<{ id: string }[]>`insert into travellers (company_id, name, phone, language, first_platform) values (${c.companyId}, ${contact.fullName ?? ""}, ${contact.phoneNumber ?? null}, ${lang}, ${c.platform}) returning id`;
      travellerId = tr.id;
    }
    const [ch] = await tx<{ id: string }[]>`insert into channels (company_id, platform, method, last_event_at) values (${c.companyId}, ${c.platform}, 'api', now())
      on conflict (company_id, platform, method) do update set last_event_at = now(), status = 'active' returning id`;
    const ref = (body.resellerReference ?? h.resellerReference ?? h.id).slice(0, 100);
    const [b] = await tx<{ id: string }[]>`insert into bookings (company_id, channel_id, platform, external_ref, tour_id, tour_name, traveller_id, starts_at, people, status)
      values (${c.companyId}, ${ch.id}, ${c.platform}, ${ref}, ${t.id}, ${t.title}, ${travellerId}, ${h.startsAt}, ${h.people}, 'confirmed')
      on conflict (company_id, platform, external_ref) do update set people = excluded.people returning id`;
    const [done] = await tx<Hold[]>`update octo_holds set status = 'CONFIRMED', booking_id = ${b.id}, reseller_reference = ${ref} where id = ${h.id}
      returning id, tour_id, starts_at, people, status, reseller_reference, expires_at, booking_id`;
    return { obj: bookingObject(done, t, c.timezone, body.contact), bookingId: b.id };
  });
  if (result.bookingId) await (await import("./booking-events")).afterBookingChange(result.bookingId, "new");
  return result.obj;
}

/** Cancel a hold or a confirmed booking; places go back (and the waiting list is told). */
export async function cancel(c: Caller, uuid: string) {
  const result = await system(async (tx) => {
    const { h, t } = await holdFor(tx, c, uuid);
    if (h.status === "CANCELLED") return { obj: bookingObject(h, t, c.timezone), bookingId: null };
    if (h.bookingId) await tx`update bookings set status = 'cancelled' where id = ${h.bookingId}`;
    const [done] = await tx<Hold[]>`update octo_holds set status = 'CANCELLED' where id = ${h.id} returning id, tour_id, starts_at, people, status, reseller_reference, expires_at, booking_id`;
    return { obj: bookingObject(done, t, c.timezone), bookingId: h.bookingId };
  });
  if (result.bookingId) await (await import("./booking-events")).afterBookingChange(result.bookingId, "cancel");
  return result.obj;
}
