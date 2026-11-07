import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLocalDays, localDate, toInstant, weekday } from "@turno/core";
import { sql, system } from "@/lib/db";
import * as cities from "@/lib/cities";
import * as crm from "@/lib/crm";
import * as pay from "@/lib/guide-pay";
import * as mk from "@/lib/marketplace";
import * as seasons from "@/lib/seasons";
import * as db from "@/lib/store";
import { draftFromText } from "@/lib/tour-ai";
import * as training from "@/lib/training";
import * as wa from "@/lib/whatsapp";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };
const TZ = "Europe/Madrid";
let owner: Session, guide: Session, guide2: Session, tourId = "", day = "", startsAt = "";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

beforeAll(async () => {
  const a = await db.createCompany({ companyName: "Más Sevilla", industry: null, locationName: "Sevilla", timezone: TZ, ownerName: "Rocío", ownerEmail: "more-a@example.com" });
  owner = (await db.sessionForUser(a.userId))!;
  for (const [name, email] of [["Pablo", "more-pablo@example.com"], ["Nuria", "more-nuria@example.com"]]) {
    const m = await db.addMember(owner, { fullName: name, email, phone: null, role: "employee", jobTitle: null, wageCents: 0 });
    await system((tx) => tx`update members set status = 'active' where id = ${m.id}`);
    const sess = (await db.sessionForUser(m.userId!))!;
    if (name === "Pablo") guide = sess; else guide2 = sess;
  }
  day = addLocalDays(localDate(new Date(), TZ), 4);
  startsAt = toInstant(day, "10:00", TZ).toISOString();
  await mk.saveProfile(owner, { slug: "mas-sevilla", headline: "Sevilla", bio: "", city: "Sevilla", languages: ["Español"], specialities: ["Historia"], videoUrl: null, published: true });
  tourId = await mk.saveTour(owner, { title: "Alcázar", description: null, meetingPoint: "Puerta del León", durationMin: 120, capacity: 12, priceModel: "per_person", priceCents: 3000,
    published: true, maxPeoplePerBooking: 8, weeklySlots: [{ weekday: weekday(day), time: "10:00" }], includes: ["Entrada al Alcázar"], insuranceCents: 300, requiresTraining: true, script: "Patio de las Doncellas: …" });
});
afterAll(() => sql.end());

describe("seasons, loyalty and insurance", () => {
  it("prices a booking with the season of its date, the loyalty discount and the optional insurance", async () => {
    expect(seasons.withSeason(3000, 20)).toBe(3600);
    expect(seasons.withSeason(2990, -15)).toBe(2550); // 2541.5 rounded to 50 cents
    expect(await ruleCode(seasons.saveSeason(owner, { tourId: null, name: "Mal", startsOn: day, endsOn: addLocalDays(day, -1), percent: 10 }))).not.toBeNull();
    await seasons.saveSeason(owner, { tourId: null, name: "Feria", startsOn: addLocalDays(day, -1), endsOn: addLocalDays(day, 1), percent: 10 });
    await seasons.saveSeason(owner, { tourId, name: "Semana Santa", startsOn: day, endsOn: day, percent: 20 });
    expect((await seasons.seasons(owner)).map((x) => x.name).sort()).toEqual(["Feria", "Semana Santa"]);
    expect(await ruleCode(seasons.saveSeason(guide, { tourId: null, name: "x", startsOn: day, endsOn: day, percent: 5 }))).toBe("forbidden");

    // the tour-specific season wins: 30 € + 20 % = 36 € a person
    const first = await mk.book({ slug: "mas-sevilla", tourId, startsAt, people: 2, name: "Eva", email: "eva-more@example.com", phone: null, language: "es", insurance: true });
    const [b1] = await system((tx) => tx<{ grossCents: number; seasonPercent: number; insuranceCents: number; loyaltyCents: number }[]>`select gross_cents, season_percent, insurance_cents, loyalty_cents from bookings where id = ${first.bookingId}`);
    expect(b1).toMatchObject({ grossCents: 7200, seasonPercent: 20, insuranceCents: 600, loyaltyCents: 0 });

    // she came, then books again with loyalty on: 10 % off
    await system((tx) => tx`update bookings set status = 'attended' where id = ${first.bookingId}`);
    await system((tx) => tx`update companies set loyalty_percent = 10 where id = ${owner.company.id}`);
    const again = await mk.book({ slug: "mas-sevilla", tourId, startsAt, people: 1, name: "Eva", email: "EVA-more@example.com", phone: null, language: "es" });
    const view = await mk.bookingByCode("mas-sevilla", again.code);
    expect(view).toMatchObject({ loyaltyCents: 360, insuranceCents: 0 });
    // a new traveller pays the full price
    const fresh = await mk.book({ slug: "mas-sevilla", tourId, startsAt, people: 1, name: "Leo", email: "leo-more@example.com", phone: null, language: "es" });
    expect((await mk.bookingByCode("mas-sevilla", fresh.code))).toMatchObject({ loyaltyCents: 0 });
  });
});

describe("review photos", () => {
  it("keeps up to three photos with the review and shows them publicly; refuses files that are not images", async () => {
    const [b] = await system((tx) => tx<{ id: string }[]>`select id from bookings where company_id = ${owner.company.id} limit 1`);
    await system((tx) => tx`insert into reviews (company_id, booking_id, token_hash) values (${owner.company.id}, ${b.id}, encode(sha256('tok-more'::bytea), 'hex'))`);
    expect(await ruleCode(crm.submitReview("tok-more", 5, "x", "Eva", [new Uint8Array([1, 2, 3])]))).toBe("photo");
    await crm.submitReview("tok-more", 5, "Precioso", "Eva", [jpeg, jpeg, jpeg, jpeg]);
    const { list } = await crm.companyReviews(owner.company.id);
    expect(list[0].photos).toHaveLength(3);
  });
});

describe("whatsapp", () => {
  const payload = (text: string) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "PN-MORE" }, contacts: [{ wa_id: "34600111222", profile: { name: "Marta" } }],
    messages: [{ from: "34600111222", type: "text", text: { body: text } }, { from: "34600111222", type: "image" }] } }] }] });

  it("reads text messages from a webhook payload and checks Meta's signature", () => {
    expect(wa.readPayload(payload("Hola"))).toEqual([{ phoneNumberId: "PN-MORE", from: "34600111222", name: "Marta", text: "Hola" }]);
    expect(wa.readPayload({})).toEqual([]);
    const prev = process.env.WHATSAPP_APP_SECRET; process.env.WHATSAPP_APP_SECRET = "s3cret";
    try {
      const raw = JSON.stringify(payload("Hola"));
      expect(wa.validSignature(raw, `sha256=${createHmac("sha256", "s3cret").update(raw).digest("hex")}`)).toBe(true);
      expect(wa.validSignature(raw, "sha256=00")).toBe(false);
      expect(wa.validSignature(raw, null)).toBe(false);
    } finally { if (prev === undefined) delete process.env.WHATSAPP_APP_SECRET; else process.env.WHATSAPP_APP_SECRET = prev; }
  });

  it("files the message as a conversation and answers a frequent question automatically, only when it is turned on", async () => {
    await system((tx) => tx`update companies set whatsapp_phone_id = 'PN-MORE', whatsapp_auto_reply = true where id = ${owner.company.id}`);
    const sent: { url: string; body: string }[] = [];
    const fake = (async (url: string, init: RequestInit) => { sent.push({ url, body: String(init.body) }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    const prev = process.env.WHATSAPP_TOKEN; process.env.WHATSAPP_TOKEN = "test-token";
    try {
      expect(await wa.handleIncoming(wa.readPayload(payload("¿Dónde es el punto de encuentro?")), fake)).toBe(1);
      expect(sent[0].url).toContain("/PN-MORE/messages");
      expect(JSON.parse(sent[0].body)).toMatchObject({ to: "34600111222", type: "text" });
      // a message that matches nothing specific waits for a person
      expect(await wa.handleIncoming(wa.readPayload(payload("Tengo una pregunta rara")), fake)).toBe(0);
      await system((tx) => tx`update companies set whatsapp_auto_reply = false where id = ${owner.company.id}`);
      expect(await wa.handleIncoming(wa.readPayload(payload("¿Dónde es el punto de encuentro?")), fake)).toBe(0);
    } finally { if (prev === undefined) delete process.env.WHATSAPP_TOKEN; else process.env.WHATSAPP_TOKEN = prev; }
    const conv = await system((tx) => tx<{ channel: string; phone: string; n: number }[]>`select i.channel, i.phone, (select count(*)::int from inquiry_messages m where m.inquiry_id = i.id) as n
      from inquiries i where i.company_id = ${owner.company.id} and i.channel = 'whatsapp'`);
    expect(conv).toEqual([{ channel: "whatsapp", phone: "34600111222", n: 4 }]); // 3 from Marta + 1 automatic answer
    // a number nobody connected is ignored
    expect(await wa.handleIncoming([{ phoneNumberId: "UNKNOWN", from: "1", name: "", text: "hi" }])).toBe(0);
  });
});

describe("training", () => {
  it("only suggests trained guides for a tour that requires training", async () => {
    for (const g of [guide, guide2]) await pay.savePayRule(owner, { memberId: g.member.id, perTourCents: 2000, perPersonCents: 0, tipShareBps: 0, languages: [] });
    const from = new Date(), to = new Date(Date.now() + 10 * 86_400_000);
    expect(await pay.suggestAssignments(owner, from, to)).toEqual([]); // nobody trained yet
    expect(await ruleCode(training.setTrained(guide, tourId, guide.member.id, true))).toBe("forbidden");
    await training.setTrained(owner, tourId, guide2.member.id, true);
    const s = await pay.suggestAssignments(owner, from, to);
    expect(s.map((x) => x.memberId)).toEqual([guide2.member.id]);
    expect(await training.tourScript(guide2, "Alcázar")).toContain("Doncellas");
    await training.setTrained(owner, tourId, guide2.member.id, false);
    expect(await training.trainedPairs(owner)).toEqual([]);
  });
});

describe("AI tour creator (rules)", () => {
  it("drafts a tour from one sentence", () => {
    const d = draftFromText("Tour de tapas por el barrio de Triana y la Plaza de España, 2,5 horas, 35 euros con vino incluido", 2500);
    expect(d).toMatchObject({ durationMin: 150, priceCents: 3500, priceModel: "per_person", includes: ["Tapas", "Vino"] });
    expect(d.stops.map((x) => x.name)).toEqual(["Triana", "Plaza de España"]);
    expect(draftFromText("Ruta en bici. Empieza en Sol y acaba en el Retiro", null).stops.map((x) => x.name)).toEqual(["Sol", "Retiro"]);
    expect(d.title.length).toBeLessThanOrEqual(60);
    const free = draftFromText("Free tour por el centro de Sevilla, a la voluntad, 90 minutos", 2000);
    expect(free).toMatchObject({ priceModel: "free_tip", priceCents: 0, durationMin: 90 });
    expect(draftFromText("Visita privada por grupo al Alcázar", null)).toMatchObject({ priceModel: "per_group", priceCents: 2500, durationMin: 120 });
  });
});

describe("cities", () => {
  it("needs the agency plan for a second city and reports each city apart", async () => {
    expect(await ruleCode(cities.addCity(owner, "Córdoba", TZ))).toBe("plan_limit");
    expect(await ruleCode(cities.addCity(guide, "Córdoba", TZ))).toBe("forbidden");
    await system((tx) => tx`insert into subscriptions (company_id, plan, status) values (${owner.company.id}, 'plus', 'active') on conflict (company_id) do update set plan = 'plus'`);
    expect(await ruleCode(cities.addCity(owner, "Córdoba", "Not/AZone"))).toBe("timezone");
    await cities.addCity(owner, "Córdoba", TZ);
    const locs = await cities.listLocations(owner);
    expect(locs.map((l) => l.name)).toEqual(["Sevilla", "Córdoba"]);
    const report = await cities.cityReport(owner, new Date(Date.now() - 86_400_000), new Date(Date.now() + 30 * 86_400_000));
    expect(report.map((r) => r.city)).toEqual(["Sevilla", "Córdoba"]);
    expect(report[0].bookings).toBeGreaterThan(0);
    expect(report[1]).toMatchObject({ bookings: 0, tours: 0 });
  });
});

describe("sustainable seal", () => {
  it("shows the seal and passes the filter only with local shops and small groups", async () => {
    expect(mk.isSustainable({ sustainableLocal: true }, [{ capacity: 12 }])).toBe(true);
    expect(mk.isSustainable({ sustainableLocal: true }, [{ capacity: 12 }, { capacity: 30 }])).toBe(false);
    expect(mk.isSustainable({ sustainableLocal: false }, [{ capacity: 8 }])).toBe(false);
    expect((await mk.search({ sustainable: "1", city: "Sevilla" })).map((h) => h.slug)).not.toContain("mas-sevilla");
    await mk.saveProfile(owner, { slug: "mas-sevilla", headline: "Sevilla", bio: "", city: "Sevilla", languages: ["Español"], specialities: ["Historia"], videoUrl: null, published: true,
      sustainableLocal: true, sustainableNoPlastic: true, sustainablePublicTransport: false });
    expect((await mk.publicProfile("mas-sevilla"))?.sustainable).toBe(true);
    const hits = await mk.search({ sustainable: "1", city: "Sevilla" });
    expect(hits.find((h) => h.slug === "mas-sevilla")?.sustainable).toBe(true);
    expect((await mk.searchTours({ sustainable: "1", city: "Sevilla" })).find((t) => t.title === "Alcázar")?.sustainable).toBe(true);
  });
});
