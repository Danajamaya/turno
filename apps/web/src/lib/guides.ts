// Guides: bookings from every channel in one calendar, guide income, and
// Turno's own earnings. Email ingestion runs as system (the sender is a
// platform, not a signed-in user); everything a person looks at goes through
// withUser() and row level security.
import "server-only";
import { randomBytes } from "node:crypto";
import { AUTO_IMPORT_CONFIDENCE, bookingStart, guideNetCents, readBookingEmail, type ParsedBooking } from "@turno/core";
import { system, withUser, type Tx } from "./db";
import type { Session } from "./types";
import { RuleError } from "./types";

export const PLATFORMS = ["guruwalk", "freetour", "strawberry", "getyourguide", "viator", "civitatis"] as const;
export const platformName: Record<string, string> = {
  turno: "Turno", guruwalk: "GuruWalk", freetour: "Freetour.com", strawberry: "Strawberry Tours",
  getyourguide: "GetYourGuide", viator: "Viator", civitatis: "Civitatis", other: "Otro", unknown: "Desconocido",
};

const managerOnly = (s: Session) => {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede hacer esto.");
};

// ------------------------------------------------------------- forwarding address

export const inboundDomain = () => process.env.INBOUND_DOMAIN ?? "reservas.example.com";

export async function forwardingAddress(s: Session): Promise<string> {
  managerOnly(s);
  const token = await system(async (tx) => {
    const [row] = await tx<{ token: string }[]>`select token from inbound_addresses where company_id = ${s.company.id}`;
    if (row) return row.token;
    const t = randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");
    await tx`insert into inbound_addresses (token, company_id) values (${t}, ${s.company.id}) on conflict (company_id) do nothing`;
    const [again] = await tx<{ token: string }[]>`select token from inbound_addresses where company_id = ${s.company.id}`;
    return again.token;
  });
  return `r-${token}@${inboundDomain()}`;
}

// ------------------------------------------------------------- ingestion

export interface InboundEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
  messageId: string;
  /** SPF or DKIM passed for the sender's domain, as reported by the mail provider. */
  authenticated: boolean;
}

export type IngestResult =
  | { status: "unknown_address" }
  | { status: "duplicate" }
  | { status: "imported"; bookingId: string; kind: ParsedBooking["kind"] }
  | { status: "cancel_pending" }
  | { status: "needs_review"; reason: string }
  | { status: "ignored"; reason: string };

/**
 * One email in, at most one booking out. Idempotent on Message-ID and on the
 * platform's booking reference, so retries and duplicate forwards are safe.
 */
export async function ingestEmail(mail: InboundEmail): Promise<IngestResult> {
  const token = /\br-([a-z0-9]+)@/i.exec(mail.to)?.[1]?.toLowerCase();
  if (!token) return { status: "unknown_address" };
  return system(async (tx) => {
    const [addr] = await tx<{ companyId: string }[]>`select company_id from inbound_addresses where token = ${token}`;
    if (!addr) return { status: "unknown_address" } as const;
    const companyId = addr.companyId;
    const parsed = readBookingEmail(mail);
    const [stored] = await tx<{ id: string }[]>`
      insert into inbound_emails (company_id, message_id, from_address, subject, body_text, platform, reader, confidence, extracted, status)
      values (${companyId}, ${mail.messageId}, ${mail.from}, ${mail.subject}, ${mail.text}, ${parsed.platform}, ${parsed.reader},
              ${parsed.confidence}, ${tx.json(parsed as never)}, 'needs_review')
      on conflict (company_id, message_id) do nothing returning id`;
    if (!stored) return { status: "duplicate" } as const;

    const finish = async (status: "imported" | "needs_review" | "ignored", bookingId: string | null = null) =>
      tx`update inbound_emails set status = ${status}, booking_id = ${bookingId} where id = ${stored.id}`;

    if (parsed.platform === "unknown") {
      await finish("ignored");
      return { status: "ignored", reason: "El remitente no es una plataforma conocida." } as const;
    }
    if (!mail.authenticated) return { status: "needs_review", reason: "El correo no pasó la verificación del remitente." } as const;
    if (parsed.confidence < AUTO_IMPORT_CONFIDENCE) return { status: "needs_review", reason: "Faltan datos o no son claros." } as const;

    const result = await applyBooking(tx, companyId, parsed, stored.id);
    if (result.status === "imported") await finish("imported", result.bookingId);
    else if (result.status === "cancel_pending") await finish("imported");
    return result;
  });
}

async function companyTimezone(tx: Tx, companyId: string): Promise<string> {
  const [l] = await tx<{ timezone: string }[]>`select timezone from locations where company_id = ${companyId} order by created_at limit 1`;
  return l?.timezone ?? "Europe/Madrid";
}

async function ensureChannel(tx: Tx, companyId: string, platform: string, method: string): Promise<string> {
  const [c] = await tx<{ id: string }[]>`
    insert into channels (company_id, platform, method, last_event_at) values (${companyId}, ${platform}, ${method}, now())
    on conflict (company_id, platform, method) do update set last_event_at = now(), status = 'active'
    returning id`;
  return c.id;
}

async function upsertTraveller(tx: Tx, companyId: string, p: ParsedBooking): Promise<string | null> {
  if (!p.travellerName && !p.travellerEmail && !p.travellerPhone) return null;
  if (p.travellerEmail) {
    const [t] = await tx<{ id: string }[]>`
      insert into travellers (company_id, name, email, phone, first_platform)
      values (${companyId}, ${p.travellerName ?? ""}, ${p.travellerEmail}, ${p.travellerPhone}, ${p.platform})
      on conflict (company_id, lower(email)) where email is not null
      do update set phone = coalesce(travellers.phone, excluded.phone), name = case when travellers.name = '' then excluded.name else travellers.name end
      returning id`;
    return t.id;
  }
  if (p.travellerPhone) {
    const [found] = await tx<{ id: string }[]>`select id from travellers where company_id = ${companyId} and phone = ${p.travellerPhone}`;
    if (found) return found.id;
  }
  const [t] = await tx<{ id: string }[]>`
    insert into travellers (company_id, name, phone, first_platform) values (${companyId}, ${p.travellerName ?? ""}, ${p.travellerPhone}, ${p.platform}) returning id`;
  return t.id;
}

/** Shared by email import and manual review. Assumes the fields were checked. */
async function applyBooking(tx: Tx, companyId: string, p: ParsedBooking, emailId: string | null, method = "forward"): Promise<IngestResult> {
  const channelId = await ensureChannel(tx, companyId, p.platform, method);
  const ref = p.externalRef;
  if (p.kind === "cancel") {
    if (!ref) return { status: "needs_review", reason: "Cancelación sin número de reserva." };
    const [b] = await tx<{ id: string }[]>`
      update bookings set status = 'cancelled' where company_id = ${companyId} and platform = ${p.platform} and external_ref = ${ref} returning id`;
    if (b) return { status: "imported", bookingId: b.id, kind: "cancel" };
    await tx`insert into pending_cancellations (company_id, platform, external_ref) values (${companyId}, ${p.platform}, ${ref}) on conflict do nothing`;
    return { status: "cancel_pending" };
  }
  const startsAt = bookingStart(p, await companyTimezone(tx, companyId));
  if (!ref || !startsAt || !p.people) return { status: "needs_review", reason: "Faltan número de reserva, fecha, hora o personas." };
  const travellerId = await upsertTraveller(tx, companyId, p);
  const [pending] = await tx`delete from pending_cancellations where company_id = ${companyId} and platform = ${p.platform} and external_ref = ${ref} returning 1`;
  const [fee] = await tx<{ fee: number }[]>`select fee_per_person_cents as fee from channels where id = ${channelId}`;
  const [b] = await tx<{ id: string }[]>`
    insert into bookings (company_id, channel_id, platform, external_ref, tour_name, traveller_id, starts_at, people, status, platform_fee_cents, source_email_id)
    values (${companyId}, ${channelId}, ${p.platform}, ${ref}, ${p.tourName}, ${travellerId}, ${startsAt}, ${p.people},
            ${pending ? "cancelled" : "confirmed"}, ${(fee?.fee ?? 0) * p.people}, ${emailId})
    on conflict (company_id, platform, external_ref) do update set
      starts_at = excluded.starts_at, people = excluded.people,
      tour_name = coalesce(excluded.tour_name, bookings.tour_name),
      traveller_id = coalesce(bookings.traveller_id, excluded.traveller_id),
      platform_fee_cents = excluded.platform_fee_cents,
      status = case when bookings.status = 'cancelled' and ${p.kind} = 'change' then 'confirmed' else bookings.status end
    returning id`;
  return { status: "imported", bookingId: b.id, kind: p.kind };
}

// ------------------------------------------------------------- review queue

export async function reviewQueue(s: Session) {
  managerOnly(s);
  return withUser(s.userId, (tx) => tx<{ id: string; fromAddress: string; subject: string; platform: string; receivedAt: string; extracted: ParsedBooking; bodyText: string | null }[]>`
    select id, from_address, subject, platform, received_at, extracted, body_text from inbound_emails
    where company_id = ${s.company.id} and status = 'needs_review' order by received_at desc limit 50`);
}

/** The guide confirms or corrects what the reader found. */
export async function resolveReview(s: Session, emailId: string, fix: { platform: string; kind: ParsedBooking["kind"]; externalRef: string; date: string; time: string; people: number; tourName: string | null; travellerName: string | null } | "ignore") {
  managerOnly(s);
  return withUser(s.userId, async (tx) => {
    const [mail] = await tx<{ id: string; extracted: ParsedBooking }[]>`
      select id, extracted from inbound_emails where id = ${emailId} and company_id = ${s.company.id} and status = 'needs_review'`;
    if (!mail) throw new RuleError("not_found", "Ese correo ya se revisó.");
    if (fix === "ignore") {
      await tx`update inbound_emails set status = 'ignored' where id = ${emailId}`;
      return null;
    }
    const merged: ParsedBooking = { ...mail.extracted, ...fix, platform: fix.platform as ParsedBooking["platform"], confidence: 1, reader: "manual" };
    // Writes go through system: the booking pipeline also touches pending cancellations.
    const result = await system((sys) => applyBooking(sys, s.company.id, merged, emailId));
    if (result.status === "needs_review") throw new RuleError("incomplete", result.reason);
    await tx`update inbound_emails set status = 'imported', booking_id = ${result.status === "imported" ? result.bookingId : null} where id = ${emailId}`;
    return result;
  });
}

// ------------------------------------------------------------- calendar & CRM

export interface CalendarBooking {
  id: string; platform: string; externalRef: string; tourName: string | null; startsAt: string; people: number;
  status: string; travellerName: string | null; travellerPhone: string | null; travellerEmail: string | null;
  grossCents: number; platformFeeCents: number; tipsCents: number; turnoCommissionCents: number; currency: string;
}

export async function calendar(s: Session, from: Date, to: Date): Promise<CalendarBooking[]> {
  return withUser(s.userId, (tx) => tx<CalendarBooking[]>`
    select b.id, b.platform, b.external_ref, b.tour_name, b.starts_at, b.people, b.status,
           t.name as traveller_name, t.phone as traveller_phone, t.email as traveller_email,
           b.gross_cents, b.platform_fee_cents, b.tips_cents, b.turno_commission_cents, b.currency
    from bookings b left join travellers t on t.id = b.traveller_id
    where b.company_id = ${s.company.id} and b.starts_at >= ${from} and b.starts_at < ${to}
    order by b.starts_at`);
}

/** The bookings that arrived most recently, from any channel. */
export async function recentBookings(s: Session, limit = 6): Promise<(CalendarBooking & { createdAt: string })[]> {
  managerOnly(s);
  return withUser(s.userId, (tx) => tx<(CalendarBooking & { createdAt: string })[]>`
    select b.id, b.platform, b.external_ref, b.tour_name, b.starts_at, b.people, b.status, b.created_at,
           t.name as traveller_name, t.phone as traveller_phone, t.email as traveller_email,
           b.gross_cents, b.platform_fee_cents, b.tips_cents, b.turno_commission_cents, b.currency
    from bookings b left join travellers t on t.id = b.traveller_id
    where b.company_id = ${s.company.id} order by b.created_at desc limit ${limit}`);
}

export async function channels(s: Session) {
  managerOnly(s);
  return withUser(s.userId, (tx) => tx<{ id: string; platform: string; method: string; status: string; lastEventAt: string | null; feePerPersonCents: number }[]>`
    select id, platform, method, status, last_event_at, fee_per_person_cents from channels where company_id = ${s.company.id} order by platform`);
}

export async function setChannelFee(s: Session, platform: string, feeCents: number) {
  managerOnly(s);
  await withUser(s.userId, (tx) => tx`
    insert into channels (company_id, platform, method, fee_per_person_cents) values (${s.company.id}, ${platform}, 'forward', ${feeCents})
    on conflict (company_id, platform, method) do update set fee_per_person_cents = excluded.fee_per_person_cents`);
}

/** After the tour: how many came and the tips collected. */
export async function closeBooking(s: Session, bookingId: string, input: { attended: boolean; tipsCents: number }) {
  managerOnly(s);
  const [row] = await withUser(s.userId, (tx) => tx`
    update bookings set status = ${input.attended ? "attended" : "no_show"}, tips_cents = ${input.tipsCents}
    where id = ${bookingId} and company_id = ${s.company.id} and status <> 'cancelled' returning id`);
  if (!row) throw new RuleError("not_found", "No se encontró esa reserva.");
}

// ------------------------------------------------------------- money

export interface IncomeRow { platform: string; bookings: number; people: number; grossCents: number; platformFeeCents: number; turnoCommissionCents: number; tipsCents: number; netCents: number }

/** The guide's income by channel for a period (cancelled bookings excluded). */
export async function guideIncome(s: Session, from: Date, to: Date): Promise<{ rows: IncomeRow[]; total: IncomeRow }> {
  managerOnly(s);
  const list = await calendar(s, from, to);
  const by = new Map<string, IncomeRow>();
  for (const b of list) {
    if (b.status === "cancelled") continue;
    const r = by.get(b.platform) ?? { platform: b.platform, bookings: 0, people: 0, grossCents: 0, platformFeeCents: 0, turnoCommissionCents: 0, tipsCents: 0, netCents: 0 };
    r.bookings++; r.people += b.people; r.grossCents += b.grossCents; r.platformFeeCents += b.platformFeeCents;
    r.turnoCommissionCents += b.turnoCommissionCents; r.tipsCents += b.tipsCents; r.netCents += guideNetCents(b);
    by.set(b.platform, r);
  }
  const rows = [...by.values()].sort((a, b) => b.netCents - a.netCents);
  const total = rows.reduce<IncomeRow>((t, r) => ({
    platform: "total", bookings: t.bookings + r.bookings, people: t.people + r.people, grossCents: t.grossCents + r.grossCents,
    platformFeeCents: t.platformFeeCents + r.platformFeeCents, turnoCommissionCents: t.turnoCommissionCents + r.turnoCommissionCents,
    tipsCents: t.tipsCents + r.tipsCents, netCents: t.netCents + r.netCents,
  }), { platform: "total", bookings: 0, people: 0, grossCents: 0, platformFeeCents: 0, turnoCommissionCents: 0, tipsCents: 0, netCents: 0 });
  return { rows, total };
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await withUser(userId, (tx) => tx`select 1 from platform_admins where user_id = ${userId}`);
  return !!row;
}

/** Turno's own earnings: commissions and subscriptions, by month. Admins only. */
export async function platformEarnings(userId: string, from: Date, to: Date) {
  if (!(await isPlatformAdmin(userId))) throw new RuleError("forbidden", "Solo el equipo de Turno puede ver esto.");
  return system(async (tx) => {
    const byMonth = await tx<{ month: string; kind: string; cents: number; currency: string }[]>`
      select to_char(date_trunc('month', occurred_at), 'YYYY-MM') as month, kind, sum(amount_cents)::int as cents, currency
      from platform_ledger where occurred_at >= ${from} and occurred_at < ${to}
      group by 1, 2, 4 order by 1`;
    const [counts] = await tx<{ companies: number; payingCompanies: number; bookings: number; marketplaceGmvCents: number }[]>`
      select (select count(*)::int from companies) as companies,
             (select count(*)::int from subscriptions where plan <> 'free' and status in ('active','trialing')) as paying_companies,
             (select count(*)::int from bookings where starts_at >= ${from} and starts_at < ${to} and status <> 'cancelled') as bookings,
             (select coalesce(sum(gross_cents), 0)::int from bookings where platform = 'turno' and starts_at >= ${from} and starts_at < ${to} and status <> 'cancelled') as marketplace_gmv_cents`;
    const [settings] = await tx<{ commissionBpsFree: number; commissionBpsPaid: number }[]>`select commission_bps_free, commission_bps_paid from platform_settings`;
    return { byMonth, counts, settings };
  });
}
