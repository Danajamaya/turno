// Demand-based advice for a tour's weekly departures. Pure: give it how full
// each slot was over recent weeks and it says where to raise the price, add a
// departure, try a launch price or drop the slot. Thresholds are deliberately
// simple so a guide can follow the reasoning shown next to each idea.

export interface SlotStats {
  tourId: string; tourName: string; weekday: number; time: string;
  departures: number;      // departures that ran in the period
  people: number;          // people booked across them (all platforms)
  capacity: number;        // places per departure
  priceModel: "free_tip" | "per_person" | "per_group"; priceCents: number;
}

export type AdviceKind = "raise_price" | "add_departure" | "launch_price" | "drop_slot";
export interface Advice { kind: AdviceKind; tourId: string; tourName: string; weekday: number; time: string; fill: number; departures: number; suggestedPriceCents?: number; score: number }

export const FULL = 0.9, EMPTY = 0.3, MIN_DEPARTURES = 3;
const roundTo50 = (c: number) => Math.round(c / 50) * 50;

export function demandAdvice(slots: SlotStats[]): Advice[] {
  const out: Advice[] = [];
  for (const s of slots) {
    if (s.departures < MIN_DEPARTURES || s.capacity <= 0) continue; // not enough history to say anything
    const fill = Math.min(1.5, s.people / (s.departures * s.capacity));
    const base = { tourId: s.tourId, tourName: s.tourName, weekday: s.weekday, time: s.time, fill, departures: s.departures };
    if (fill >= FULL) {
      out.push(s.priceModel === "free_tip"
        ? { ...base, kind: "add_departure", score: fill * s.departures }
        : { ...base, kind: "raise_price", suggestedPriceCents: roundTo50(s.priceCents * 1.1), score: fill * s.departures });
    } else if (fill <= EMPTY) {
      out.push(s.priceModel === "free_tip"
        ? { ...base, kind: "drop_slot", score: (1 - fill) * s.departures }
        : { ...base, kind: "launch_price", suggestedPriceCents: roundTo50(s.priceCents * 0.85), score: (1 - fill) * s.departures });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
