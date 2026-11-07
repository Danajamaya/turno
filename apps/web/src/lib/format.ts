import { formatMoney, localTime } from "@turno/core";

const LOCALE = "es-US";

// Euros the Spanish way ("55,00 €"), dollars the US-Spanish way ("US$55.00").
export const money = (cents: number, currency = "USD") => formatMoney(cents, currency, currency === "USD" ? LOCALE : "es-ES");

/** Whole units for headline numbers: "4333 €". */
export const moneyWhole = (cents: number, currency = "USD") =>
  new Intl.NumberFormat(currency === "USD" ? LOCALE : "es-ES", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(cents / 100));

/** "9:00" / "17:30" in the location's zone. */
export const hm = (iso: string | Date, tz: string) => localTime(typeof iso === "string" ? new Date(iso) : iso, tz);

export function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function rangeLabel(from: string, to: string) {
  const f = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt.format(f(from))} – ${fmt.format(f(to))}`;
}

export const hours = (minutes: number) => (minutes / 60).toLocaleString(LOCALE, { maximumFractionDigits: 2 });
