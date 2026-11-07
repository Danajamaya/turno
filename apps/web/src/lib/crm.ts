// Travellers CRM: everyone who booked, from every channel; a daily queue of
// messages (reminder the day before, review request after the tour) sent by
// email or opened in WhatsApp with the text ready, always previewed first;
// and reviews that can only come from a real booking, through its own link.
import "server-only";
import { groupLink } from "./ops";
import { createHash, randomBytes } from "node:crypto";
import { addLocalDays, localDate, localRange } from "@turno/core";
import { system, withUser } from "./db";
import { appUrl, sendEmail } from "./email";
import { platformName } from "./guides";
import type { Session } from "./types";
import { RuleError } from "./types";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const managerOnly = (s: Session) => { if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede hacer esto."); };

export interface TravellerRow { id: string; name: string; email: string | null; phone: string | null; language: string | null; bookings: number; people: number; lastAt: string | null; platforms: string[] }

export async function travellers(s: Session, q = ""): Promise<TravellerRow[]> {
  managerOnly(s);
  const like = `%${q.trim().toLowerCase()}%`;
  return withUser(s.userId, (tx) => tx<TravellerRow[]>`
    select t.id, t.name, t.email, t.phone, t.language,
           count(b.id)::int as bookings, coalesce(sum(b.people) filter (where b.status <> 'cancelled'), 0)::int as people,
           max(b.starts_at) as last_at, coalesce(array_agg(distinct b.platform) filter (where b.platform is not null), '{}') as platforms
    from travellers t left join bookings b on b.traveller_id = t.id
    where t.company_id = ${s.company.id}
      ${q.trim() ? tx`and (lower(t.name) like ${like} or lower(coalesce(t.email, '')) like ${like} or coalesce(t.phone, '') like ${like})` : tx``}
    group by t.id order by max(b.starts_at) desc nulls last limit 200`);
}

export async function traveller(s: Session, id: string) {
  managerOnly(s);
  return withUser(s.userId, async (tx) => {
    const [t] = await tx<TravellerRow[]>`select id, name, email, phone, language, 0 as bookings, 0 as people, null as last_at, '{}'::text[] as platforms
      from travellers where id = ${id} and company_id = ${s.company.id}`;
    if (!t) return null;
    const bookings = await tx<{ id: string; platform: string; tourName: string | null; startsAt: string; people: number; status: string; grossCents: number; currency: string }[]>`
      select id, platform, tour_name, starts_at, people, status, gross_cents, currency from bookings where traveller_id = ${id} order by starts_at desc`;
    const messages = await tx<{ id: string; kind: string; body: string; status: string; sentVia: string | null; sentAt: string | null; dueOn: string }[]>`
      select id, kind, body, status, sent_via, sent_at, due_on from message_queue where traveller_id = ${id} order by created_at desc`;
    const reviews = await tx<{ rating: number | null; body: string | null; submittedAt: string | null }[]>`
      select r.rating, r.body, r.submitted_at from reviews r join bookings b on b.id = r.booking_id where b.traveller_id = ${id} and r.submitted_at is not null`;
    return { ...t, bookingList: bookings, messages, reviews };
  });
}

// ------------------------------------------------------------- message queue

const SPANISH = /^\+(34|52|54|56|57|51|58|593|591|595|598|506|503|502|504|505|507|53|1809|1829|1849)/;
/** The traveller's language if known; otherwise a guess from the phone prefix; otherwise Spanish. */
export const guessLanguage = (language: string | null, phone: string | null): "es" | "en" =>
  language === "en" || language === "es" ? language : phone && !SPANISH.test(phone) ? "en" : "es";

function reminder(lang: "es" | "en", v: { name: string; tour: string; when: string; meeting: string | null; company: string; group?: string | null }) {
  const first = v.name.split(" ")[0] || (lang === "es" ? "hola" : "there");
  return lang === "es"
    ? `¡Hola ${first}! Te esperamos mañana ${v.when} en «${v.tour}»${v.meeting ? `. Punto de encuentro: ${v.meeting}` : ""}. Si no puedes venir, avísanos por aquí.${v.group ? ` Si llegas tarde, aquí ves dónde está el grupo: ${v.group}` : ""} ¡Hasta mañana! — ${v.company}`
    : `Hi ${first}! See you tomorrow ${v.when} for "${v.tour}"${v.meeting ? `. Meeting point: ${v.meeting}` : ""}. If you can't make it, just reply here.${v.group ? ` Running late? See where the group is: ${v.group}` : ""} See you! — ${v.company}`;
}
function reviewAsk(lang: "es" | "en", v: { name: string; tour: string; link: string; company: string }) {
  const first = v.name.split(" ")[0] || "";
  return lang === "es"
    ? `¡Gracias por venir a «${v.tour}», ${first}! ¿Nos cuentas qué te pareció? Son 30 segundos: ${v.link} — ${v.company}`
    : `Thanks for joining "${v.tour}", ${first}! Would you tell us how it was? It takes 30 seconds: ${v.link} — ${v.company}`;
}

/**
 * Fills today's queue: a reminder for tomorrow's bookings and a review request
 * for bookings that came yesterday or today. Idempotent per booking and kind.
 */
export async function buildQueue(s: Session, now = new Date()): Promise<number> {
  managerOnly(s);
  const tz = s.location.timezone, today = localDate(now, tz);
  const tomorrow = localRange(addLocalDays(today, 1), 1, tz), recent = localRange(addLocalDays(today, -1), 2, tz);
  return system(async (tx) => {
    const rows = await tx<{ id: string; travellerId: string; name: string; phone: string | null; email: string | null; language: string | null; tourName: string | null; startsAt: string; status: string; meetingPoint: string | null }[]>`
      select b.id, b.traveller_id, t.name, t.phone, t.email, t.language, b.tour_name, b.starts_at, b.status, tr.meeting_point
      from bookings b join travellers t on t.id = b.traveller_id left join tours tr on tr.id = b.tour_id
      where b.company_id = ${s.company.id} and (t.phone is not null or t.email is not null) and (
        (b.status = 'confirmed' and b.starts_at >= ${tomorrow.start} and b.starts_at < ${tomorrow.end})
        or (b.status = 'attended' and b.starts_at >= ${recent.start} and b.starts_at < ${recent.end} and b.starts_at < ${now}))`;
    let added = 0;
    for (const r of rows) {
      const lang = guessLanguage(r.language, r.phone);
      const tour = r.tourName ?? (lang === "es" ? "tu tour" : "your tour");
      if (r.status === "confirmed") {
        const when = new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(r.startsAt));
        const body = reminder(lang, { name: r.name, tour, when: lang === "es" ? `a las ${when}` : `at ${when}`, meeting: r.meetingPoint, company: s.company.name,
          group: r.tourName ? groupLink(s.company.id, new Date(r.startsAt).toISOString(), r.tourName) : null });
        const ins = await tx`insert into message_queue (company_id, booking_id, traveller_id, kind, language, body, due_on)
          values (${s.company.id}, ${r.id}, ${r.travellerId}, 'reminder', ${lang}, ${body}, ${today}) on conflict (booking_id, kind) do nothing returning id`;
        added += ins.length;
      } else {
        const token = randomBytes(18).toString("base64url");
        const body = reviewAsk(lang, { name: r.name, tour, link: `${appUrl()}/resena/${token}`, company: s.company.name });
        const ins = await tx`insert into message_queue (company_id, booking_id, traveller_id, kind, language, body, due_on)
          values (${s.company.id}, ${r.id}, ${r.travellerId}, 'review', ${lang}, ${body}, ${today}) on conflict (booking_id, kind) do nothing returning id`;
        if (ins.length) {
          await tx`insert into reviews (company_id, booking_id, token_hash) values (${s.company.id}, ${r.id}, ${hash(token)}) on conflict (booking_id) do nothing`;
          added++;
        }
      }
    }
    return added;
  });
}

export interface QueueItem { id: string; kind: "reminder" | "review"; language: string; body: string; status: string; dueOn: string; travellerId: string | null; name: string | null; phone: string | null; email: string | null; tourName: string | null; startsAt: string; platform: string }

export async function queue(s: Session, status: "pending" | "sent" = "pending"): Promise<QueueItem[]> {
  managerOnly(s);
  return withUser(s.userId, (tx) => tx<QueueItem[]>`
    select q.id, q.kind, q.language, q.body, q.status, q.due_on, q.traveller_id, t.name, t.phone, t.email, b.tour_name, b.starts_at, b.platform
    from message_queue q join bookings b on b.id = q.booking_id left join travellers t on t.id = q.traveller_id
    where q.company_id = ${s.company.id} and q.status = ${status} ${status === "sent" ? tx`and q.sent_at > now() - interval '7 days'` : tx``}
    order by b.starts_at limit 200`);
}

/** WhatsApp click-to-chat link with the text ready (no API: the person presses send in WhatsApp). */
export const whatsappLink = (phone: string, body: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(body)}`;

export async function markSent(s: Session, id: string, via: "whatsapp" | "email", body?: string): Promise<void> {
  managerOnly(s);
  const rows = await withUser(s.userId, (tx) => tx`update message_queue set status = 'sent', sent_via = ${via}, sent_at = now(), body = coalesce(${body ?? null}, body)
    where id = ${id} and company_id = ${s.company.id} and status = 'pending' returning id`);
  if (!rows.length) throw new RuleError("not_found", "Ese mensaje ya se envió o no existe.");
}

export async function sendByEmail(s: Session, id: string, body: string): Promise<void> {
  managerOnly(s);
  const [item] = (await queue(s)).filter((q) => q.id === id);
  if (!item) throw new RuleError("not_found", "Ese mensaje ya se envió o no existe.");
  if (!item.email) throw new RuleError("no_email", "Este viajero no tiene correo. Usa WhatsApp.");
  const text = body.trim().slice(0, 2000) || item.body;
  await sendEmail({ to: item.email, subject: item.kind === "reminder" ? (item.language === "en" ? `See you tomorrow: ${item.tourName}` : `Te esperamos mañana: ${item.tourName}`) : (item.language === "en" ? "How was your tour?" : "¿Qué te pareció el tour?"), text });
  await markSent(s, id, "email", text);
}

export async function skip(s: Session, id: string): Promise<void> {
  managerOnly(s);
  await withUser(s.userId, (tx) => tx`update message_queue set status = 'skipped' where id = ${id} and company_id = ${s.company.id} and status = 'pending'`);
}

// ------------------------------------------------------------- reviews

/** The review behind a link, for the public form. */
export async function reviewByToken(token: string) {
  return system(async (tx) => {
    const [r] = await tx<{ id: string; tourName: string | null; companyName: string; submittedAt: string | null; travellerName: string | null; slug: string | null; rating: number | null; googleReviewUrl: string | null }[]>`
      select r.id, b.tour_name, c.name as company_name, r.submitted_at, t.name as traveller_name, gp.slug, r.rating, c.google_review_url
      from reviews r join bookings b on b.id = r.booking_id join companies c on c.id = r.company_id
      left join travellers t on t.id = b.traveller_id left join guide_profiles gp on gp.company_id = r.company_id
      where r.token_hash = ${hash(token)}`;
    return r ?? null;
  });
}

/** One review per booking; the link works once. */
export async function submitReview(token: string, rating: number, body: string, authorName: string, photos: Uint8Array[] = []): Promise<void> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new RuleError("rating", "Elige de 1 a 5 estrellas.");
  const { sniff, MAX_BYTES } = await import("./media");
  const pics = photos.filter((p) => p.length > 0).slice(0, 3);
  for (const p of pics) if (p.length > MAX_BYTES || !sniff(p)) throw new RuleError("photo", "Las fotos tienen que ser JPG, PNG o WebP de hasta 2 MB.");
  await system(async (tx) => {
    const rows = await tx<{ id: string; companyId: string }[]>`update reviews set rating = ${rating}, body = ${body.trim().slice(0, 1500) || null},
      author_name = ${authorName.trim().slice(0, 60) || null}, submitted_at = now()
      where token_hash = ${hash(token)} and submitted_at is null returning id, company_id`;
    if (!rows.length) throw new RuleError("used", "Esta reseña ya se envió. ¡Gracias!");
    for (const [i, p] of pics.entries()) await tx`insert into media (company_id, owner_kind, owner_id, content_type, bytes, sort) values (${rows[0].companyId}, 'review', ${rows[0].id}, ${sniff(p)!}, ${Buffer.from(p)}, ${i})`;
  });
}

export async function companyReviews(companyId: string, limit = 20) {
  return system(async (tx) => {
    const list = await tx<{ id: string; rating: number; body: string | null; authorName: string | null; submittedAt: string; platform: string; tourName: string | null; reply: string | null; photos: string[] }[]>`
      select r.id, (select coalesce(array_agg(m.id order by m.sort), '{}') from media m where m.owner_kind = 'review' and m.owner_id = r.id) as photos, r.rating, r.body, r.author_name, r.submitted_at, b.platform, b.tour_name, r.reply from reviews r join bookings b on b.id = r.booking_id
      where r.company_id = ${companyId} and r.submitted_at is not null order by r.submitted_at desc limit ${limit}`;
    const [agg] = await tx<{ avg: number | null; count: number }[]>`select round(avg(rating)::numeric, 1)::float as avg, count(*)::int as count
      from reviews where company_id = ${companyId} and submitted_at is not null`;
    const rows = await tx<{ rating: number; n: number }[]>`select rating, count(*)::int as n from reviews
      where company_id = ${companyId} and submitted_at is not null group by rating`;
    const dist = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: rows.find((x) => x.rating === r)?.n ?? 0 }));
    return { list, avg: agg.avg, count: agg.count, dist };
  });
}

export { platformName };
