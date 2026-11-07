import { describe, expect, it } from "vitest";
import { demandAdvice, type SlotStats } from "./demand.ts";

const slot = (o: Partial<SlotStats>): SlotStats => ({ tourId: "t", tourName: "Tour", weekday: 6, time: "10:30", departures: 6, people: 0, capacity: 20, priceModel: "per_person", priceCents: 2000, ...o });

describe("demandAdvice", () => {
  it("raises the price of a paid slot that is nearly always full, rounded to 50 cents", () => {
    const [a] = demandAdvice([slot({ people: 6 * 19 })]);
    expect(a).toMatchObject({ kind: "raise_price", suggestedPriceCents: 2200 });
    expect(a.fill).toBeCloseTo(0.95);
  });
  it("suggests another departure for a full free tour, and dropping an empty one", () => {
    expect(demandAdvice([slot({ priceModel: "free_tip", priceCents: 0, people: 120 })])[0].kind).toBe("add_departure");
    expect(demandAdvice([slot({ priceModel: "free_tip", priceCents: 0, people: 20 })])[0].kind).toBe("drop_slot");
  });
  it("offers a launch price for a paid slot that stays empty", () => {
    expect(demandAdvice([slot({ people: 18, priceCents: 3900 })])[0]).toMatchObject({ kind: "launch_price", suggestedPriceCents: 3300 });
  });
  it("says nothing without enough history or in the healthy middle", () => {
    expect(demandAdvice([slot({ departures: 2, people: 40 }), slot({ people: 70 })])).toEqual([]);
  });
  it("puts the strongest signal first", () => {
    const list = demandAdvice([slot({ tourId: "a", departures: 3, people: 57 }), slot({ tourId: "b", departures: 8, people: 160 })]);
    expect(list.map((x) => x.tourId)).toEqual(["b", "a"]);
  });
});
