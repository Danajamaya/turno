import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLocalDays, localDate, weekday } from "@turno/core";
import { sql, system } from "@/lib/db";
import * as app from "@/lib/guide-app";
import * as feeds from "@/lib/feeds";
import * as g from "@/lib/guides";
import * as mk from "@/lib/marketplace";
import * as db from "@/lib/store";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };
const TZ = "Europe/Madrid";
let owner: Session, diego: Session, sara: Session, other: Session, addr: string;

async function guide(s: Session, name: string, email: string) {
  const m = await db.addMember(s, { fullName: name, email, phone: null, role: "employee", jobTitle: "Guía", wageCents: 0 });
  await system((tx) => tx`update members set status = 'active' where id = ${m.id}`);
  return (await db.sessionForUser(m.userId!))!;
}
const tomorrow = () => addLocalDays(localDate(new Date(), TZ), 1);
const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");

beforeAll(async () => {
  const a = await db.createCompany({ companyName: "Fin A", industry: null, locationName: "Madrid", timezone: TZ, ownerName: "Lucía", ownerEmail: "fin-owner@example.com" });
  owner = (await db.sessionForUser(a.userId))!;
  diego = await guide(owner, "Diego", "fin-diego@example.com");
  sara = await guide(owner, "Sara", "fin-sara@example.com");
  const b = await db.createCompany({ companyName: "Fin B", industry: null, locationName: "Roma", timezone: "Europe/Rome", ownerName: "Marco", ownerEmail: "fin-b@example.com" });
  other = (await db.sessionForUser(b.userId))!;
  addr = await g.forwardingAddress(owner);
  const send = (from: string, text: string, id: string) => g.ingestEmail({ to: addr, from, subject: "Nueva reserva", text, messageId: id, authenticated: true });
  await send("GuruWalk <noreply@guruwalk.com>", `Tour: Austrias\nFecha: ${ddmmyyyy(tomorrow())}\nHora: 10:30\nPersonas: 6\nNombre: Ana\nReserva nº: GW1000001`, "<f1>");
  await send("Freetour <b@freetour.com>", `Activity: Austrias\nDate: ${ddmmyyyy(tomorrow())}\nTime: 10:30 AM\nParticipants: 2\nName: Bob\nBooking ID: FT-1000002`, "<f2>");
});
afterAll(() => sql.end());

describe("guide app", () => {
  it("assigns a guide to a whole tour and shows it only to that guide", async () => {
    const day = new Date(), later = new Date(Date.now() + 3 * 86_400_000);
    const [tour] = await app.tourGroups(owner, day, later);
    expect(tour).toMatchObject({ tourName: "Austrias", people: 8, platforms: ["guruwalk", "freetour"], guideMemberId: null });
    expect(await ruleCode(app.assignGuide(diego, tour.key, diego.member.id))).toBe("forbidden");
    expect(await ruleCode(app.assignGuide(owner, tour.key, other.member.id))).toBe("not_found");
    expect(await app.assignGuide(owner, tour.key, diego.member.id)).toBe(2);
    expect((await app.myTours(diego, day, later)).map((t) => t.people)).toEqual([8]);
    expect(await app.myTours(sara, day, later)).toEqual([]);
    expect(await ruleCode(app.tourGroups(diego, day, later))).toBe("forbidden");
  });

  it("lets only the assigned guide check people in, and splits tips by people", async () => {
    const [tour] = await app.myTours(diego, new Date(), new Date(Date.now() + 3 * 86_400_000));
    const [ana, bob] = tour.attendees;
    expect(await ruleCode(app.checkIn(sara, ana.id, true))).toBe("forbidden");
    expect(await ruleCode(app.checkIn(other, ana.id, true))).toBe("not_found"); // another business: the booking does not exist for them
    await app.checkIn(diego, ana.id, true);
    await app.checkIn(diego, bob.id, true);
    expect(await ruleCode(app.closeTour(sara, tour.key, 1000))).toBe("forbidden");
    await app.closeTour(diego, tour.key, 8001); // 8001 cents over 6 + 2 people
    const after = (await app.myTours(diego, new Date(), new Date(Date.now() + 3 * 86_400_000)))[0];
    expect(after.tipsCents).toBe(8001);
    expect(after.attendees.map((a) => a.status)).toEqual(["attended", "attended"]);
    const tips = (await g.calendar(owner, new Date(), new Date(Date.now() + 3 * 86_400_000))).map((b) => b.tipsCents).sort((a, b) => b - a);
    expect(tips).toEqual([6000, 2001]);
  });
});

describe("calendar feeds", () => {
  it("serves a private .ics, scoped by role, and revokes the old link", async () => {
    const url = await feeds.regenerateFeed(diego);
    const token = /calendario\/([\w-]+)\.ics$/.exec(url)![1];
    const ics = (await feeds.icsForToken(token))!;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Austrias · 8 personas");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    const saraUrl = await feeds.regenerateFeed(sara);
    expect(await feeds.icsForToken(/calendario\/([\w-]+)\.ics$/.exec(saraUrl)![1])).not.toContain("BEGIN:VEVENT");
    await feeds.regenerateFeed(diego);
    expect(await feeds.icsForToken(token)).toBeNull();
    expect(await feeds.icsForToken("x".repeat(32))).toBeNull();
  });
});

describe("marketplace", () => {
  let tourId: string;
  it("publishes a profile only when asked, with a unique address", async () => {
    expect(await ruleCode(mk.saveProfile(owner, { slug: "Ma", headline: "", bio: "", city: "", languages: [], specialities: [], videoUrl: null, published: false }))).toBe("slug");
    await mk.saveProfile(owner, { slug: "fin-a", headline: "Madrid con historia", bio: "Hola", city: "Madrid", languages: ["Español"], specialities: ["Historia"], videoUrl: null, published: false });
    expect(await mk.publicProfile("fin-a")).toBeNull();
    expect(await ruleCode(mk.saveProfile(other, { slug: "fin-a", headline: "", bio: "", city: "", languages: [], specialities: [], videoUrl: null, published: true }))).toBe("slug_taken");
    await mk.saveProfile(owner, { slug: "fin-a", headline: "Madrid con historia", bio: "Hola", city: "Madrid", languages: ["Español"], specialities: ["Historia"], videoUrl: null, published: true });
    const wd = weekday(addLocalDays(localDate(new Date(), TZ), 2));
    tourId = await mk.saveTour(owner, { title: "Prado", description: "Obras clave", meetingPoint: "Puerta de Goya", durationMin: 120, capacity: 5, priceModel: "per_person", priceCents: 3900, published: true, maxPeoplePerBooking: 4, weeklySlots: [{ weekday: wd, time: "11:00" }] });
    expect(await ruleCode(mk.saveTour(diego, { title: "x", description: null, meetingPoint: null, durationMin: 60, capacity: 5, priceModel: "free_tip", priceCents: 0, published: true, maxPeoplePerBooking: 4, weeklySlots: [] }))).toBe("forbidden");
    const pub = (await mk.publicProfile("fin-a"))!;
    expect(pub.tours.map((t) => t.title)).toEqual(["Prado"]);
  });

  it("books with the price and Turno's commission, and never overbooks", async () => {
    const pub = (await mk.publicProfile("fin-a"))!;
    const [dep] = await mk.departures(pub.tours[0], pub.companyId, TZ);
    expect(dep.left).toBe(5);
    const base = { slug: "fin-a", tourId, startsAt: dep.startsAt, name: "Anna", email: "anna@example.com", phone: null, language: "de" };
    const { code } = await mk.book({ ...base, people: 2 });
    const b = (await mk.bookingByCode("fin-a", code))!;
    expect(b).toMatchObject({ tourName: "Prado", people: 2, grossCents: 7800, payment: "on_site" });
    const [row] = await system((tx) => tx<{ turnoCommissionCents: number }[]>`select turno_commission_cents from bookings where external_ref = ${code}`);
    expect(row.turnoCommissionCents).toBe(1404); // 18 % on the free plan
    expect(await ruleCode(mk.book({ ...base, people: 5 }))).toBe("people");
    // two travellers race for the last 3 places
    const race = await Promise.allSettled([mk.book({ ...base, people: 2, email: "x1@example.com" }), mk.book({ ...base, people: 2, email: "x2@example.com" })]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(((race.find((r) => r.status === "rejected") as PromiseRejectedResult).reason as RuleError).code).toBe("full");
    expect(await ruleCode(mk.book({ ...base, people: 1, startsAt: new Date(Date.now() + 86_400_000 * 40).toISOString() }))).toBe("slot");
    const income = await g.guideIncome(owner, new Date(Date.now() - 86_400_000), new Date(Date.now() + 10 * 86_400_000));
    expect(income.rows.find((r) => r.platform === "turno")).toMatchObject({ bookings: 2, grossCents: 15600, turnoCommissionCents: 2808, netCents: 12792 });
  });
});
