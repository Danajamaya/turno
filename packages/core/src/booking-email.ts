// Reads booking notification emails from tour platforms (GuruWalk, Freetour,
// Strawberry Tours, GetYourGuide, Viator, Civitatis) in Spanish or English.
// Pure: no I/O. Platform-specific rules go in RULES once real sample emails
// exist; until then the generic reader below extracts what it can and says how
// sure it is, so the caller can send unsure results to AI or human review.
import { toInstant } from "./time.ts";

export type Platform = "guruwalk" | "freetour" | "strawberry" | "getyourguide" | "viator" | "civitatis" | "unknown";
export type BookingKind = "new" | "change" | "cancel";

export interface InboundMessage {
  from: string;     // "GuruWalk <noreply@guruwalk.com>"
  subject: string;
  text: string;     // plain-text body (HTML already converted)
}

export interface ParsedBooking {
  platform: Platform;
  kind: BookingKind;
  externalRef: string | null;
  tourName: string | null;
  date: string | null;  // YYYY-MM-DD, local to the tour city
  time: string | null;  // HH:mm, 24 h
  people: number | null;
  travellerName: string | null;
  travellerEmail: string | null;
  travellerPhone: string | null;
  /** 0..1: how complete and unambiguous the extraction is. */
  confidence: number;
  reader: string;
}

const SENDERS: [RegExp, Platform][] = [
  [/@([\w-]+\.)*guruwalk\.com\b/i, "guruwalk"],
  [/@([\w-]+\.)*freetour\.com\b/i, "freetour"],
  [/@([\w-]+\.)*strawberrytours\.com\b/i, "strawberry"],
  [/@([\w-]+\.)*getyourguide\.com\b/i, "getyourguide"],
  [/@([\w-]+\.)*(viator|tripadvisor)\.com\b/i, "viator"],
  [/@([\w-]+\.)*civitatis\.com\b/i, "civitatis"],
];

/**
 * Platform from the sender's domain only (the body can be forged or quoted),
 * matched on the whole domain so "guruwalk.com.evil.io" is not GuruWalk.
 * Senders can still be spoofed: the inbound side must check SPF/DKIM results.
 */
export function detectPlatform(from: string): Platform {
  const address = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim().toLowerCase();
  const domain = address.split("@").pop() ?? "";
  for (const [re, p] of SENDERS) if (re.test("@" + domain) && re.exec("@" + domain)![0] === "@" + domain) return p;
  return "unknown";
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

/** First calendar date in the text. Day-first for numeric dates (Europe). */
export function findDate(text: string): string | null {
  let m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/.exec(text);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /\b(\d{1,2})(?:\s+de)?\s+([a-záéíóú]{3,10})\.?(?:\s+de)?,?\s+(20\d{2})\b/i.exec(text);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = /\b([a-z]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i.exec(text);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return null;
}

/** First clock time, 24 h. Accepts "10:00", "10.30h", "3:30 PM", "15 h". */
export function findTime(text: string): string | null {
  const m = /\b(\d{1,2})[:.](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?|h\b|hrs?\b)?/i.exec(text)
    ?? /\b(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)/i.exec(text);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] && /^\d{2}$/.test(m[2]) ? +m[2] : 0;
  const suffix = (m[3] ?? (m[2] && !/^\d/.test(m[2]) ? m[2] : "") ?? "").toLowerCase().replace(/[.\s]/g, "");
  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function findPeople(text: string): number | null {
  const m = /\b(?:personas|people|participants|participantes|guests|pax|adults|adultos|walkers|plazas)[ \t]*[:=][ \t]*(\d{1,3})\b/i.exec(text)
    ?? /\b(\d{1,3})[ \t]*(?:x[ \t]*)?(personas?|people|persons?|adult(?:o|e)?s?|participant(?:e)?s?|walkers?|guests?|pax|viajeros?|travell?ers?|asistentes?|plazas?)\b/i.exec(text);
  if (!m) return null;
  const n = +m[1];
  return n >= 1 && n <= 500 ? n : null;
}

export function findRef(text: string): string | null {
  const m = /\b(?:booking|reserva|reservation|confirmation|confirmación|localizador|referencia|reference|order|pedido)\s*(?:id|n[ºo°.]?|number|número|code|código|ref(?:erence)?)?[ \t]*[:#]?[ \t]*#?[ \t]*((?=[A-Z-]*\d)[A-Z0-9][A-Z0-9-]{4,})\b/i.exec(text);
  return m ? m[1].toUpperCase() : null;
}

function findKind(subject: string, text: string): BookingKind {
  const s = `${subject}\n${text.slice(0, 400)}`;
  if (/\b(cancel(?:ad[ao]|ación|led|lation|ed)?|anulad[ao])\b/i.test(s)) return "cancel";
  if (/\b(modific|cambi[oa]|changed|updated|amend|reprogram)/i.test(s)) return "change";
  return "new";
}

const field = (text: string, labels: string): string | null => {
  const m = new RegExp(`\\b(?:${labels})\\s*:\\s*([^\\n]{2,80})`, "i").exec(text);
  return m ? m[1].trim() : null;
};

/** The generic reader: labelled fields first, then free-text patterns. */
export function readBookingEmail(msg: InboundMessage): ParsedBooking {
  const platform = detectPlatform(msg.from);
  const text = msg.text.replace(/\r/g, "");
  const all = `${msg.subject}\n${text}`;
  const dateField = field(text, "fecha|date|día|day");
  const timeField = field(text, "hora|time|horario|start time|inicio");
  const parsed: ParsedBooking = {
    platform,
    kind: findKind(msg.subject, text),
    externalRef: findRef(all),
    tourName: field(text, "tour|actividad|activity|experiencia|experience|free tour|walk"),
    date: (dateField && findDate(dateField)) ?? findDate(all),
    time: (timeField && findTime(timeField)) ?? findTime(all.replace(/\b\d{1,2}[/.]\d{1,2}[/.]20\d{2}\b/g, "")),
    people: findPeople(all),
    travellerName: field(text, "nombre|name|cliente|customer|traveller|traveler|viajero|walker|lead traveller"),
    travellerEmail: /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/.exec(text.replace(/\S+@\S*(guruwalk|freetour|strawberrytours|getyourguide|viator|tripadvisor|civitatis)\.com/gi, ""))?.[0] ?? null,
    travellerPhone: /(?:\+|00)\d[\d\s-]{7,16}\d/.exec(text)?.[0].replace(/[\s-]/g, "") ?? null,
    confidence: 0,
    reader: "generic",
  };
  parsed.confidence = score(parsed);
  return parsed;
}

/**
 * Completeness, not truth. An unknown sender caps it low so a stranger's email
 * can never land in the calendar on its own.
 */
export function score(p: ParsedBooking): number {
  const needs = p.kind === "cancel" ? [p.externalRef || (p.date && p.time)] : [p.date, p.time, p.people, p.externalRef];
  const have = needs.filter(Boolean).length / needs.length;
  const bonus = p.tourName ? 0.05 : 0;
  const capped = p.platform === "unknown" ? Math.min(have, 0.3) : have;
  return Math.round(Math.min(1, capped * 0.9 + bonus) * 100) / 100;
}

/** Imports automatically only at or above this; the rest goes to review. */
export const AUTO_IMPORT_CONFIDENCE = 0.85;

/** The booking's start instant in the tour city's time zone. */
export function bookingStart(p: Pick<ParsedBooking, "date" | "time">, timezone: string): Date | null {
  return p.date && p.time ? toInstant(p.date, p.time, timezone) : null;
}
