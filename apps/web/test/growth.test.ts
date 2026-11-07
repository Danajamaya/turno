import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLocalDays, localDate, toInstant, weekday } from "@turno/core";
import { sql, system } from "@/lib/db";
import * as g from "@/lib/guides";
import * as mk from "@/lib/marketplace";
import * as db from "@/lib/store";
import * as wl from "@/lib/waitlist";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };
const TZ = "Europe/Madrid";
const outbox = path.join(process.cwd(), ".data", "outbox.jsonl");
const mails = async () => (await fs.readFile(outbox, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string; text: string });
const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");

let owner: Session, guide: Session, other: Session, addr = "", tourId = "", day = "", startsAt = "";
const gw = (text: string, id: string) => g.ingestEmail({ to: addr, from: "GuruWalk <noreply@guruwalk.com>", subject: "Reserva", text, messageId: id, authenticated: true });

beforeAll(async () => {
  const a = await db.createCompany({ companyName: "Growth A", industry: null, locationName: "Sevilla", timezone: TZ, ownerName: "Pilar", ownerEmail: "growth-a@example.com" });
  owner = (await db.sessionForUser(a.userId))!;
  const m = await db.addMember(owner, { fullName: "Álvaro", email: "growth-alvaro@example.com", phone: null, role: "employee", jobTitle: null, wageCents: 0 });
  await system((tx) => tx`update members set status = 'active' where id = ${m.id}`);
  guide = (await db.sessionForUser(m.userId!))!;
  const b = await db.createCompany({ companyName: "Growth B", industry: null, locationName: "Oporto", timezone: "Europe/Lisbon", ownerName: "Joana", ownerEmail: "growth-b@example.com" });
  other = (await db.sessionForUser(b.userId))!;
  addr = await g.forwardingAddress(owner);
  day = addLocalDays(localDate(new Date(), TZ), 2);
  startsAt = toInstant(day, "10:00", TZ).toISOString();
  await mk.saveProfile(owner, { slug: "growth-a", headline: "Sevilla a pie", bio: "", city: "Sevilla", languages: ["Español"], specialities: ["Historia"], videoUrl: null, published: true });
  tourId = await mk.saveTour(owner, { title: "Ruta Triana", description: null, meetingPoint: "Puente", durationMin: 120, capacity: 4, priceModel: "per_person", priceCents: 2000,
    published: true, maxPeoplePerBooking: 4, weeklySlots: [{ weekday: weekday(day), time: "10:00" }] });
  await fs.rm(outbox, { force: true });
});
afterAll(() => sql.end());

describe("1. waitlist", () => {
  it("only opens when the departure is full, then emails the first person whose group fits after a cancellation", async () => {
    const req = { slug: "growth-a", tourId, startsAt, name: "Ana", email: "ana@example.com", people: 2, language: "es" as const };
    expect(await ruleCode(wl.joinWaitlist(req))).toBe("open");
    await gw(`Tour: Ruta Triana\nFecha: ${ddmmyyyy(day)}\nHora: 10:00\nPersonas: 2\nNombre: Carla\nReserva nº: GW3000001`, "<w1>");
    await mk.book({ slug: "growth-a", tourId, startsAt, people: 2, name: "Diego", email: "diego@example.com", phone: null, language: "es" });
    await wl.joinWaitlist({ ...req, name: "Ben", email: "ben@example.com", people: 3 });
    await wl.joinWaitlist(req);
    await wl.joinWaitlist(req); // twice is fine
    await gw(`Reserva cancelada\nTour: Ruta Triana\nFecha: ${ddmmyyyy(day)}\nHora: 10:00\nPersonas: 2\nReserva nº: GW3000001`, "<w2>");
    const sent = (await mails()).filter((m) => /plaza/.test(m.subject));
    expect(sent.map((m) => m.to)).toEqual(["ana@example.com"]); // Ben's group of 3 does not fit in 2 places
    expect(sent[0].text).toContain("/g/growth-a?lang=es#tour-");
  });
});

describe("2. overbooking", () => {
  it("finds departures sold over capacity across platforms and emails the managers", async () => {
    await fs.rm(outbox, { force: true });
    await gw(`Tour: Ruta Triana\nFecha: ${ddmmyyyy(day)}\nHora: 10:00\nPersonas: 3\nNombre: Eva\nReserva nº: GW3000002`, "<w3>");
    const over = await wl.overbookings(owner, new Date(), new Date(Date.now() + 7 * 86_400_000));
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ tourName: "Ruta Triana", people: 5, capacity: 4, closed: false });
    expect(over[0].platforms.sort()).toEqual(["guruwalk", "turno"]);
    expect((await mails()).some((m) => m.to === "growth-a@example.com" && m.subject.startsWith("Sobreventa"))).toBe(true);
    expect(await wl.overbookings(other, new Date(), new Date(Date.now() + 7 * 86_400_000))).toEqual([]);
  });

  it("lets a manager stop selling a departure on Turno, and only a manager", async () => {
    expect(await ruleCode(wl.setDepartureClosed(guide, tourId, startsAt, true))).toBe("forbidden");
    expect(await ruleCode(wl.setDepartureClosed(other, tourId, startsAt, true))).toBe("not_found");
    await system((tx) => tx`update bookings set status = 'cancelled' where external_ref = 'GW3000002'`);
    const pub = (await mk.publicProfile("growth-a"))!;
    const before = (await mk.departures(pub.tours[0], pub.companyId, TZ)).find((d) => d.startsAt === startsAt)!;
    expect(before.left).toBe(2);
    await wl.setDepartureClosed(owner, tourId, startsAt, true);
    expect((await mk.departures(pub.tours[0], pub.companyId, TZ)).find((d) => d.startsAt === startsAt)!.left).toBe(0);
    expect(await ruleCode(mk.book({ slug: "growth-a", tourId, startsAt, people: 1, name: "X", email: "x@example.com", phone: null, language: "es" }))).toBe("full");
    await wl.setDepartureClosed(owner, tourId, startsAt, false);
    expect((await mk.departures(pub.tours[0], pub.companyId, TZ)).find((d) => d.startsAt === startsAt)!.left).toBe(2);
  });
});

describe("3. tips by card", () => {
  it("signs a QR link only for the tour's guide or a manager, and adds paid tips to the tour", async () => {
    const tips = await import("@/lib/tips");
    const key = `${startsAt}|Ruta Triana`;
    await system((tx) => tx`update bookings set guide_member_id = ${guide.member.id} where tour_name = 'Ruta Triana'`);
    const link = await tips.tipLink(guide, key);
    const token = link.split("/propina/")[1];
    expect(await ruleCode(tips.tipLink(other, key))).toBe("not_found");
    expect(await tips.tipPage(token.slice(0, -2) + "xx")).toBeNull(); // tampered
    expect(await tips.tipPage(token)).toMatchObject({ companyName: "Growth A", guideName: "Álvaro", tourName: "Ruta Triana" });
    const key2 = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
    try {
      expect(await ruleCode(tips.startTip(token, 50))).toBe("amount");
      expect((await tips.startTip(token, 1500)).url).toContain("gracias=1");
    } finally { process.env.STRIPE_SECRET_KEY = key2; }
    const [{ total }] = await system((tx) => tx<{ total: number }[]>`select sum(tips_cents)::int as total from bookings where tour_name = 'Ruta Triana' and status <> 'cancelled'`);
    expect(total).toBe(1500);
    // closing the tour with 10 € cash keeps the 15 € by card
    const app = await import("@/lib/guide-app");
    await app.closeTour(guide, key, 1000);
    const [{ total: after }] = await system((tx) => tx<{ total: number }[]>`select sum(tips_cents)::int as total from bookings where tour_name = 'Ruta Triana' and status <> 'cancelled'`);
    expect(after).toBe(2500);
  });
});

describe("4. photos", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
  it("accepts real images from managers, rejects anything else", async () => {
    const media = await import("@/lib/media");
    const id = await media.addPhoto(owner, { kind: "tour", id: tourId }, jpeg);
    expect((await media.photosFor([tourId])).get(tourId)).toEqual([id]);
    expect((await media.photoBytes(id))!.type).toBe("image/jpeg");
    expect(await ruleCode(media.addPhoto(owner, { kind: "tour", id: tourId }, new TextEncoder().encode("<svg onload=alert(1)>")))).toBe("type");
    expect(await ruleCode(media.addPhoto(guide, { kind: "tour", id: tourId }, jpeg))).toBe("forbidden");
    expect(await ruleCode(media.addPhoto(other, { kind: "tour", id: tourId }, jpeg))).toBe("not_found");
    expect(await ruleCode(media.addPhoto(owner, { kind: "tour", id: tourId }, new Uint8Array(2_000_001)))).toBe("too_big");
    await media.deletePhoto(other, id); // not theirs: nothing happens
    expect((await media.photosFor([tourId])).get(tourId)).toEqual([id]);
    await media.deletePhoto(owner, id);
    expect((await media.photosFor([tourId])).get(tourId)).toBeUndefined();
  });
});

describe("5. questions from travellers", () => {
  it("lets a traveller ask, the business answer, and the traveller reply through a private link", async () => {
    const inq = await import("@/lib/inquiries");
    await fs.rm(outbox, { force: true });
    await inq.ask({ slug: "growth-a", name: "Mia", email: "mia@example.com", body: "Is it OK for a wheelchair?", language: "en" });
    const list = await inq.inquiries(owner);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Mia", status: "open", language: "en" });
    expect(await inq.inquiries(other)).toEqual([]);
    expect(await ruleCode(inq.inquiries(guide))).toBe("forbidden");
    const s = await inq.suggestReplies(owner, list[0].id); // no ANTHROPIC_API_KEY in tests: drafts from tour data
    expect(s.source).toBe("templates");
    expect(s.drafts[0]).toMatch(/step-free/);
    await inq.reply(owner, list[0].id, "Yes, the whole route is flat.");
    const answer = (await mails()).find((m) => m.to === "mia@example.com" && /answered/.test(m.subject))!;
    const token = /\/consulta\/([\w-]+)/.exec(answer.text)![1];
    expect((await inq.inquiryByToken(token))!.messages.map((m) => m.fromTraveller)).toEqual([true, false]);
    await inq.travellerReply(token, "Great, thanks!");
    expect((await inq.inquiries(owner))[0].status).toBe("open");
    expect(await ruleCode(inq.travellerReply("not-a-token", "hi"))).toBe("not_found");
    expect(await ruleCode(inq.reply(other, list[0].id, "x"))).toBe("not_found");
  });
});

describe("6. gift cards", () => {
  it("sells a card, then spends it on a booking until the balance runs out", async () => {
    const gifts = await import("@/lib/gifts");
    const key = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
    let code = "";
    try {
      expect(await ruleCode(gifts.startGift({ slug: "growth-a", amountCents: 100, buyerName: "Leo", buyerEmail: "leo@example.com", recipientName: "Ana", recipientEmail: null, message: null, language: "es" }))).toBe("amount");
      ({ code } = await gifts.startGift({ slug: "growth-a", amountCents: 3000, buyerName: "Leo", buyerEmail: "leo@example.com", recipientName: "Ana", recipientEmail: "ana2@example.com", message: "¡Feliz cumple!", language: "es" }));
    } finally { process.env.STRIPE_SECRET_KEY = key; }
    expect((await mails()).some((m) => m.to === "ana2@example.com" && m.text.includes(code))).toBe(true);
    const day2 = addLocalDays(day, 7), at2 = toInstant(day2, "10:00", TZ).toISOString();
    expect(await ruleCode(mk.book({ slug: "growth-a", tourId, startsAt: at2, people: 1, name: "Ana", email: "ana2@example.com", phone: null, language: "es", giftCode: "REGALO-NOPE-NOPE" }))).toBe("gift");
    await mk.book({ slug: "growth-a", tourId, startsAt: at2, people: 2, name: "Ana", email: "ana2@example.com", phone: null, language: "es", giftCode: code.toLowerCase() });
    const [b] = await system((tx) => tx<{ grossCents: number; giftCents: number }[]>`select gross_cents, gift_cents from bookings where gift_card_id is not null`);
    expect(b).toEqual({ grossCents: 4000, giftCents: 3000 }); // 2 × 20 €, the card covers 30 €
    const [g] = await gifts.giftCards(owner);
    expect(g).toMatchObject({ balanceCents: 0, status: "used" });
    expect(await ruleCode(mk.book({ slug: "growth-a", tourId, startsAt: at2, people: 1, name: "Ana", email: "ana2@example.com", phone: null, language: "es", giftCode: code }))).toBe("gift");
    expect(await ruleCode(gifts.giftCards(guide))).toBe("forbidden");
  });
});

describe("7. demand ideas", () => {
  it("reads past departures from every platform and suggests a price change for a slot that is always full", async () => {
    const { demandIdeas } = await import("@/lib/demand");
    const past = [-7, -14, -21].map((d) => addLocalDays(localDate(new Date(), TZ), d));
    for (const [i, d] of past.entries()) {
      await system((tx) => tx`insert into bookings (company_id, platform, external_ref, tour_name, starts_at, people, status)
        values (${owner.company.id}, 'guruwalk', ${"DM" + i}, 'Ruta Triana', ${toInstant(d, "18:00", TZ)}, 4, 'attended')`);
    }
    const ideas = await demandIdeas(owner);
    expect(ideas.find((a) => a.time === "18:00")).toMatchObject({ kind: "raise_price", tourName: "Ruta Triana", suggestedPriceCents: 2200, departures: 3 });
    expect(await demandIdeas(guide)).toEqual([]);
  });
});

describe("8. guide assignment and pay", () => {
  it("suggests a free guide who speaks the group's language, then pays per tour, per person and a tip share", async () => {
    const gp = await import("@/lib/guide-pay");
    const m2 = await db.addMember(owner, { fullName: "Bea", email: "growth-bea@example.com", phone: null, role: "employee", jobTitle: null, wageCents: 0 });
    await gp.savePayRule(owner, { memberId: guide.member.id, perTourCents: 3000, perPersonCents: 100, tipShareBps: 5000, languages: ["Español"] });
    await gp.savePayRule(owner, { memberId: m2.id, perTourCents: 2500, perPersonCents: 0, tipShareBps: 10000, languages: ["English"] });
    expect(await ruleCode(gp.savePayRule(guide, { memberId: guide.member.id, perTourCents: 1, perPersonCents: 0, tipShareBps: 0, languages: [] }))).toBe("forbidden");
    expect(await ruleCode(gp.savePayRule(other, { memberId: guide.member.id, perTourCents: 1, perPersonCents: 0, tipShareBps: 0, languages: [] }))).toBe("not_found");
    // an English-speaking group tomorrow, nobody assigned
    const tomorrow = addLocalDays(localDate(new Date(), TZ), 1);
    await system(async (tx) => {
      const [t] = await tx<{ id: string }[]>`insert into travellers (company_id, name, language, first_platform) values (${owner.company.id}, 'Tom', 'en', 'viator') returning id`;
      await tx`insert into bookings (company_id, platform, external_ref, tour_name, starts_at, people, traveller_id) values (${owner.company.id}, 'viator', 'VI1', 'Ruta Triana', ${toInstant(tomorrow, "12:00", TZ)}, 3, ${t.id})`;
    });
    const now = new Date(), week = new Date(now.getTime() + 7 * 86_400_000);
    const sug = await gp.suggestAssignments(owner, now, week);
    expect(sug.find((x) => x.tourName === "Ruta Triana" && x.startsAt === toInstant(tomorrow, "12:00", TZ).toISOString())).toMatchObject({ fullName: "Bea" });
    const n = await gp.applySuggestions(owner, now, week);
    expect(n).toBeGreaterThan(0);
    expect((await gp.suggestAssignments(owner, now, week))).toEqual([]);
    // pay for the tour Álvaro closed earlier (Ruta Triana, 25 € tips)
    const from = new Date(Date.now() - 60 * 86_400_000), to = new Date(Date.now() + 60 * 86_400_000);
    const lines = await gp.guidePay(owner, from, to);
    const alvaro = lines.find((l) => l.fullName === "Álvaro")!;
    expect(alvaro.tours).toBe(1);
    expect(alvaro.tipShareCents).toBe(Math.round(alvaro.tipsCents / 2));
    expect(alvaro.payCents).toBe(3000 + 100 * alvaro.people + alvaro.tipShareCents);
  });
});

describe("9. weekly summary", () => {
  it("emails each manager once per week, and never twice when runs overlap", async () => {
    const sum = await import("@/lib/summary");
    await fs.rm(outbox, { force: true });
    await system((tx) => tx`update companies set weekly_summary = false where id <> ${owner.company.id}`);
    await system((tx) => tx`insert into bookings (company_id, platform, external_ref, tour_name, starts_at, people, status)
      values (${owner.company.id}, 'freetour', 'WS1', 'Ruta Triana', ${new Date(Date.now() - 2 * 86_400_000)}, 6, 'attended')`);
    const [a, b] = await Promise.all([sum.sendWeeklySummaries(), sum.sendWeeklySummaries()]);
    expect(a + b).toBe(1);
    const sent = (await mails()).filter((m) => m.to === "growth-a@example.com" && m.subject.startsWith("Tu semana"));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("Ruta Triana");
    expect(await sum.sendWeeklySummaries()).toBe(0);
  });
});

describe("10. push", () => {
  it("stores one subscription per device, owned by the person, and sends nothing without VAPID keys", async () => {
    const push = await import("@/lib/push");
    const sub = { endpoint: "https://push.example.com/abc", keys: { p256dh: "BPub", auth: "auth" } };
    await push.savePushSubscription(guide, sub);
    await push.savePushSubscription(guide, sub);
    const [{ n }] = await system((tx) => tx<{ n: number }[]>`select count(*)::int as n from push_subscriptions where endpoint = ${sub.endpoint}`);
    expect(n).toBe(1);
    await expect(push.savePushSubscription(guide, { endpoint: "http://insecure", keys: sub.keys })).rejects.toThrow();
    expect(await push.notifyMembers(owner.company.id, { memberIds: [guide.member.id] }, { title: "x", body: "y", url: "/" })).toBe(0);
    await push.deletePushSubscription(other, sub.endpoint); // someone else's: kept
    await push.deletePushSubscription(guide, sub.endpoint);
    const [{ m }] = await system((tx) => tx<{ m: number }[]>`select count(*)::int as m from push_subscriptions where endpoint = ${sub.endpoint}`);
    expect(m).toBe(0);
  });
});
