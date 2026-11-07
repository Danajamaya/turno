// Hours and pay for a set of time cards. Federal default: overtime after 40 h
// in the workweek at 1.5x. Daily overtime is opt-in per location.
import { minutesBetween } from "./time.ts";

export interface Punch {
  clockInAt: Date;
  clockOutAt: Date | null;
  unpaidBreakMinutes?: number;
}

export interface OvertimeRules {
  weeklyThresholdMinutes: number; // 2400 = 40 h
  dailyThresholdMinutes?: number | null; // e.g. 480 in California
  multiplier?: number; // 1.5
}

export const FEDERAL: OvertimeRules = { weeklyThresholdMinutes: 2400, dailyThresholdMinutes: null, multiplier: 1.5 };

export interface Totals {
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  openCards: number;
}

/** Worked minutes of one card; open cards count up to `now`. */
export function cardMinutes(p: Punch, now: Date = new Date()): number {
  const end = p.clockOutAt ?? now;
  return Math.max(0, minutesBetween(p.clockInAt, end) - (p.unpaidBreakMinutes ?? 0));
}

/**
 * Splits one workweek of cards into regular and overtime minutes. Cards must
 * all belong to the same person and week. Daily OT is applied first, then the
 * weekly threshold counts only the remaining regular minutes, so no minute is
 * paid as overtime twice.
 */
export function weeklyTotals(cards: Punch[], rules: OvertimeRules = FEDERAL, now: Date = new Date()): Totals {
  const sorted = [...cards].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  let regular = 0;
  let overtime = 0;
  let worked = 0;
  for (const card of sorted) {
    const mins = cardMinutes(card, now);
    worked += mins;
    let reg = mins;
    if (rules.dailyThresholdMinutes != null && mins > rules.dailyThresholdMinutes) {
      overtime += mins - rules.dailyThresholdMinutes;
      reg = rules.dailyThresholdMinutes;
    }
    const room = Math.max(0, rules.weeklyThresholdMinutes - regular);
    regular += Math.min(reg, room);
    overtime += Math.max(0, reg - room);
  }
  return {
    workedMinutes: worked,
    regularMinutes: regular,
    overtimeMinutes: overtime,
    openCards: cards.filter((c) => c.clockOutAt === null).length,
  };
}

/** Gross pay in cents, rounded to the cent. */
export function grossCents(t: Pick<Totals, "regularMinutes" | "overtimeMinutes">, wageCents: number, rules: OvertimeRules = FEDERAL): number {
  const mult = rules.multiplier ?? 1.5;
  return Math.round((t.regularMinutes * wageCents + t.overtimeMinutes * wageCents * mult) / 60);
}

export function formatMoney(cents: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Commission in cents from basis points (1800 = 18%), rounded to the cent. */
export function commissionCents(grossCents: number, bps: number): number {
  return Math.round((grossCents * bps) / 10_000);
}

export interface BookingMoney { grossCents: number; platformFeeCents: number; tipsCents: number; turnoCommissionCents: number }

/** What the guide keeps from one booking. Never below zero. */
export function guideNetCents(m: BookingMoney): number {
  return Math.max(0, m.grossCents - m.platformFeeCents - m.turnoCommissionCents + m.tipsCents);
}
