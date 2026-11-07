import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLocalDays, localDate, weekday } from "@turno/core";
import { sql, system } from "@/lib/db";
import * as crm from "@/lib/crm";
import * as g from "@/lib/guides";
import * as mk from "@/lib/marketplace";
import * as db from "@/lib/store";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };
const TZ = "Europe/Madrid";
const outbox = path.join(process.cwd(), ".data", "outbox.jsonl");
let owner: Session, guide: Session, other: Session;
const ddmmyyyy = (d: string) => d.split("-").reverse().join("/");

beforeAll(async () => {
  const a = await db.createCompany({ companyName: "CRM A", industry: null, locationName: "Málaga", timezone: TZ, ownerName: "Rosa", ownerEmail: "crm-a@example.com" });
  owner = (await db.sessionForUser(a.userId))!;
  const m = await db.addMember(owner, { fullName: "Iván", email: "crm-ivan@example.com", phone: null, role: "employee", jobTitle: null, wageCents: 0 });
  await system((tx) => tx`update members set status = 'active' where id = ${m.id}`);
  guide = (await db.sessionForUser(m.userId!))!;
  const b = await db.createCompany({ companyName: "CRM B", industry: null, locationName: "Lisboa", timezone: "Europe/Lisbon", ownerName: "Rui", ownerEmail: "crm-b@example.com" });
  other = (await db.sessionForUser(b.userId))!;
  const addr = await g.forwardingAddress(owner);
  const today = localDate(new Date(), TZ);
  const send = (text: string, id: string) => g.ingestEmail({ to: addr, from: "GuruWalk <noreply@guruwalk.com>", subject: "Nueva reserva", text, messageId: id, authenticated: true });
  await send(`Tour: Centro histórico\nFecha: ${ddmmyyyy(addLocalDays(today, 1))}\nHora: 10:00\nPersonas: 2\nNombre: Laura Gómez\nTeléfono: +34 600 111 222\nReserva nº: GW2000001`, "<c1>");
  await send(`Tour: Centro histórico\nFecha: ${ddmmyyyy(addLocalDays(today, -1))}\nHora: 10:00\nPersonas: 3\nNombre: John Smith\nTeléfono: +44 7700 900123\nReserva nº: GW2000002`, "<c2>");
  await system((tx) => tx`update bookings set status = 'attended' where external_ref = 'GW2000002'`);
  await system((tx) => tx`update travellers set email = 'john@example.com' where name = 'John Smith'`);
});
afterAll(() => sql.end());

describe("travellers CRM", () => {
  it("lists travellers from every channel, only to managers of the company", async () => {
    const list = await crm.travellers(owner);
    expect(list.map((t) => t.name).sort()).toEqual(["John Smith", "Laura Gómez"]);
    expect((await crm.travellers(owner, "laura"))[0]).toMatchObject({ bookings: 1, people: 2, platforms: ["guruwalk"] });
    expect(await crm.travellers(other)).toEqual([]);
    expect(await ruleCode(crm.travellers(guide))).toBe("forbidden");
    expect(await crm.traveller(other, list[0].id)).toBeNull();
  });

  it("guesses the language from the phone when unknown", () => {
    expect(crm.guessLanguage(null, "+34600111222")).toBe("es");
    expect(crm.guessLanguage(null, "+447700900123")).toBe("en");
    expect(crm.guessLanguage(null, null)).toBe("es");
    expect(crm.guessLanguage("en", "+34600")).toBe("en");
  });
});

describe("message queue and reviews", () => {
  let reviewLink = "";
  it("queues a reminder for tomorrow and a review request for yesterday, once", async () => {
    expect(await crm.buildQueue(owner)).toBe(2);
    expect(await crm.buildQueue(owner)).toBe(0);
    const q = await crm.queue(owner);
    const rem = q.find((x) => x.kind === "reminder")!, rev = q.find((x) => x.kind === "review")!;
    expect(rem).toMatchObject({ name: "Laura Gómez", language: "es" });
    expect(rem.body).toContain("Te esperamos mañana a las 10:00");
    expect(rev).toMatchObject({ name: "John Smith", language: "en" });
    reviewLink = /\/resena\/([\w-]+)/.exec(rev.body)![1];
    expect(crm.whatsappLink("+34 600 111 222", "Hola")).toBe("https://wa.me/34600111222?text=Hola");
    await crm.markSent(owner, rem.id, "whatsapp");
    expect(await ruleCode(crm.markSent(owner, rem.id, "whatsapp"))).toBe("not_found");
    expect(await ruleCode(crm.markSent(other, rev.id, "email"))).toBe("not_found");
    await fs.rm(outbox, { force: true });
    await crm.sendByEmail(owner, rev.id, rev.body);
    const mail = JSON.parse((await fs.readFile(outbox, "utf8")).trim().split("\n").at(-1)!);
    expect(mail).toMatchObject({ to: "john@example.com", subject: "How was your tour?" });
    expect(await crm.queue(owner)).toEqual([]);
  });

  it("accepts one review per booking through its link, and shows it", async () => {
    expect(await crm.reviewByToken(reviewLink)).toMatchObject({ tourName: "Centro histórico", travellerName: "John Smith", submittedAt: null });
    expect(await ruleCode(crm.submitReview(reviewLink, 6, "x", "John"))).toBe("rating");
    await crm.submitReview(reviewLink, 5, "Loved it!", "John");
    expect(await ruleCode(crm.submitReview(reviewLink, 1, "changed my mind", "John"))).toBe("used");
    expect(await crm.reviewByToken("nope")).toBeNull();
    const r = await crm.companyReviews(owner.company.id);
    expect(r).toMatchObject({ avg: 5, count: 1 });
    expect(r.list[0]).toMatchObject({ rating: 5, body: "Loved it!", platform: "guruwalk" });
    expect((await crm.companyReviews(other.company.id)).count).toBe(0);
  });
});

describe("guide search", () => {
  it("finds published businesses by city (accents ignored), language, interest and day", async () => {
    await mk.saveProfile(owner, { slug: "crm-a-malaga", headline: "Málaga a pie", bio: "", city: "Málaga", languages: ["Español", "English"], specialities: ["Historia"], videoUrl: null, published: true });
    const wd = weekday(addLocalDays(localDate(new Date(), TZ), 3));
    await mk.saveTour(owner, { title: "Centro histórico", description: null, meetingPoint: null, durationMin: 120, capacity: 20, priceModel: "per_person", priceCents: 1500, published: true, maxPeoplePerBooking: 6, weeklySlots: [{ weekday: wd, time: "10:00" }] });
    const hit = (await mk.search({ city: "malaga" })).find((h) => h.slug === "crm-a-malaga")!;
    expect(hit).toMatchObject({ fromCents: 1500, rating: 5, reviews: 1, tours: 1 });
    expect((await mk.search({ city: "Málaga", language: "english", interest: "historia" })).some((h) => h.slug === "crm-a-malaga")).toBe(true);
    expect((await mk.search({ city: "malaga", language: "Italiano" })).some((h) => h.slug === "crm-a-malaga")).toBe(false);
    expect((await mk.search({ city: "malaga", date: addLocalDays(localDate(new Date(), TZ), 3) })).some((h) => h.slug === "crm-a-malaga")).toBe(true);
    expect((await mk.search({ city: "malaga", date: addLocalDays(localDate(new Date(), TZ), 4) })).some((h) => h.slug === "crm-a-malaga")).toBe(false);
  });
});
