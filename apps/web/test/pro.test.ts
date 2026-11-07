import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addLocalDays, localDate, toInstant, weekday } from "@turno/core";
import { sql, system } from "@/lib/db";
import * as g from "@/lib/guides";
import * as mk from "@/lib/marketplace";
import * as db from "@/lib/store";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };
const TZ = "Europe/Madrid";
let owner: Session, guide: Session, guide2: Session, other: Session, tourId = "", freeId = "", day = "", startsAt = "";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

beforeAll(async () => {
  const a = await db.createCompany({ companyName: "Pro A", industry: null, locationName: "Granada", timezone: TZ, ownerName: "Marta", ownerEmail: "pro-a@example.com" });
  owner = (await db.sessionForUser(a.userId))!;
  for (const [name, email] of [["Luis", "pro-luis@example.com"], ["Inés", "pro-ines@example.com"]]) {
    const m = await db.addMember(owner, { fullName: name, email, phone: null, role: "employee", jobTitle: null, wageCents: 0 });
    await system((tx) => tx`update members set status = 'active' where id = ${m.id}`);
    const sess = (await db.sessionForUser(m.userId!))!;
    if (name === "Luis") guide = sess; else guide2 = sess;
  }
  const b = await db.createCompany({ companyName: "Pro B", industry: null, locationName: "Faro", timezone: "Europe/Lisbon", ownerName: "Rui", ownerEmail: "pro-b@example.com" });
  other = (await db.sessionForUser(b.userId))!;
  day = addLocalDays(localDate(new Date(), TZ), 3);
  startsAt = toInstant(day, "11:00", TZ).toISOString();
  await mk.saveProfile(owner, { slug: "pro-a", headline: "Granada", bio: "", city: "Granada", languages: ["Español"], specialities: ["Historia"], videoUrl: null, published: true });
  tourId = await mk.saveTour(owner, { title: "Alhambra", description: null, meetingPoint: "Puerta de la Justicia", durationMin: 180, capacity: 10, priceModel: "per_person", priceCents: 4000,
    published: true, maxPeoplePerBooking: 8, weeklySlots: [{ weekday: weekday(day), time: "11:00" }], depositCents: 1000, equipment: ["Bandera", "Entradas"],
    stops: [{ name: "Palacios Nazaríes", lat: 37.177, lng: -3.59 }, { name: "Generalife", lat: null, lng: null }] });
  freeId = await mk.saveTour(owner, { title: "Albaicín free", description: null, meetingPoint: "Plaza Nueva", durationMin: 120, capacity: 20, priceModel: "free_tip", priceCents: 0,
    published: true, maxPeoplePerBooking: 8, weeklySlots: [{ weekday: weekday(day), time: "17:00" }], noShowFeeCents: 300 });
});
afterAll(() => sql.end());

describe("money", () => {
  it("asks a deposit and a no-show fee only when card payments are on, and stores the tour's stops and equipment", async () => {
    const t = (await mk.listTours(owner)).find((x) => x.id === tourId)!;
    expect(t.stops).toEqual([{ name: "Palacios Nazaríes", lat: 37.177, lng: -3.59 }, { name: "Generalife", lat: null, lng: null }]);
    expect(t.equipment).toEqual(["Bandera", "Entradas"]);
    const { bookingId } = await mk.book({ slug: "pro-a", tourId, startsAt, people: 2, name: "Ana", email: "ana-pro@example.com", phone: null, language: "es" });
    const free = await mk.book({ slug: "pro-a", tourId: freeId, startsAt: toInstant(day, "17:00", TZ).toISOString(), people: 3, name: "Bo", email: "bo@example.com", phone: null, language: "en" });
    const rows = await system((tx) => tx<{ id: string; depositCents: number; noShowFeeCents: number; payment: string }[]>`select id, deposit_cents, no_show_fee_cents, payment from bookings where id in (${bookingId}, ${free.bookingId})`);
    expect(rows.find((r) => r.id === bookingId)).toMatchObject({ depositCents: 2000, payment: "online" }); // STRIPE_SECRET_KEY is set in tests
    expect(rows.find((r) => r.id === free.bookingId)).toMatchObject({ noShowFeeCents: 900 });
    const key = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
    try {
      const { bookingId: plain } = await mk.book({ slug: "pro-a", tourId, startsAt, people: 1, name: "Cy", email: "cy@example.com", phone: null, language: "es" });
      const [p] = await system((tx) => tx<{ depositCents: number }[]>`select deposit_cents from bookings where id = ${plain}`);
      expect(p.depositCents).toBe(0);
    } finally { process.env.STRIPE_SECRET_KEY = key; }
  });

  it("releases places held by deposits not paid within two hours, and never charges a no-show without a card", async () => {
    const money = await import("@/lib/money");
    await system((tx) => tx`update bookings set created_at = now() - interval '3 hours' where deposit_cents > 0 and deposit_paid_at is null and company_id = ${owner.company.id}`);
    const cancelled = await money.cancelUnpaidDeposits();
    expect(cancelled).toHaveLength(1);
    const [nb] = await system((tx) => tx<{ id: string }[]>`select id from bookings where no_show_fee_cents > 0 and company_id = ${owner.company.id}`);
    await system((tx) => tx`update bookings set status = 'no_show' where id = ${nb.id}`);
    expect(await money.chargeNoShow(nb.id)).toBe(false);
  });

  it("keeps fiscal data, checks it, and builds the yearly and DAC7 reports", async () => {
    const money = await import("@/lib/money");
    expect(await ruleCode(money.saveFiscal(owner, { legalName: "Marta S.", taxId: "!!", fiscalAddress: null, googleReviewUrl: null }))).toBe("tax_id");
    expect(await ruleCode(money.saveFiscal(owner, { legalName: null, taxId: null, fiscalAddress: null, googleReviewUrl: "https://evil.example.com/x" }))).toBe("google");
    await money.saveFiscal(owner, { legalName: "Marta Sánchez", taxId: "12345678z", fiscalAddress: "Calle Real 1, Granada", googleReviewUrl: "https://g.page/r/abc/review" });
    expect(await money.fiscal(owner)).toMatchObject({ taxId: "12345678Z", googleReviewUrl: "https://g.page/r/abc/review" });
    expect(await ruleCode(money.saveFiscal(guide, { legalName: null, taxId: null, fiscalAddress: null, googleReviewUrl: null }))).toBe("forbidden");
    const year = new Date(startsAt).getUTCFullYear();
    const lines = await money.yearReport(owner, year);
    expect(lines.some((l) => l.platform === "turno" && l.grossCents > 0)).toBe(true);
    expect(await ruleCode(money.dac7(owner.userId, year))).toBe("forbidden");
    await system((tx) => tx`insert into platform_admins (user_id) values (${owner.userId}) on conflict do nothing`);
    const d = await money.dac7(owner.userId, year);
    expect(d.find((x) => x.companyId === owner.company.id)).toMatchObject({ taxId: "12345678Z" });
    await system((tx) => tx`delete from platform_admins where user_id = ${owner.userId}`);
    expect(money.csv([["a;b", 'c"d', null, 3]])).toBe('"a;b";"c""d";;3');
  });
});

describe("sales", () => {
  it("applies discount codes with limits and reports the partner's commission", async () => {
    const dc = await import("@/lib/discounts");
    await dc.saveDiscountCode(owner, { code: "hotel sol", percent: 10, amountCents: null, partnerName: "Hotel Sol", partnerCommissionBps: 1000, maxUses: 1, expiresOn: null });
    expect(await ruleCode(dc.saveDiscountCode(owner, { code: "HOTELSOL", percent: 5, amountCents: null, partnerName: null, partnerCommissionBps: 0, maxUses: null, expiresOn: null }))).toBe("taken");
    expect(await ruleCode(dc.saveDiscountCode(owner, { code: "X1", percent: 5, amountCents: 100, partnerName: null, partnerCommissionBps: 0, maxUses: null, expiresOn: null }))).toBe("code");
    const at2 = toInstant(addLocalDays(day, 7), "11:00", TZ).toISOString();
    const key = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
    try {
      await mk.book({ slug: "pro-a", tourId, startsAt: at2, people: 2, name: "Dee", email: "dee@example.com", phone: null, language: "es", discountCode: "hotelsol" });
      expect(await ruleCode(mk.book({ slug: "pro-a", tourId, startsAt: at2, people: 1, name: "E", email: "e@example.com", phone: null, language: "es", discountCode: "HOTELSOL" }))).toBe("discount");
    } finally { process.env.STRIPE_SECRET_KEY = key; }
    const [c] = await dc.discountCodes(owner);
    expect(c).toMatchObject({ code: "HOTELSOL", uses: 1, bookings: 1, paidCents: 7200, commissionCents: 720 }); // 80 € − 10 %, partner gets 10 %
    expect(await dc.discountCodes(other)).toEqual([]);
  });

  it("takes group quotes as questions with the group's details", async () => {
    const inq = await import("@/lib/inquiries");
    await inq.ask({ slug: "pro-a", name: "Colegio San Juan", email: "cole@example.com", body: "Somos 45 alumnos de 4º ESO", language: "es", kind: "quote", details: { people: 45, date: day, groupKind: "Colegio o instituto" } });
    const [q] = await inq.inquiries(owner);
    expect(q).toMatchObject({ kind: "quote", details: { people: 45, groupKind: "Colegio o instituto" } });
  });

  it("offers the Google review link only after a good review", async () => {
    const crm = await import("@/lib/crm");
    const [b] = await system((tx) => tx<{ id: string }[]>`select id from bookings where company_id = ${owner.company.id} and status <> 'cancelled' limit 1`);
    await system((tx) => tx`insert into reviews (company_id, booking_id, token_hash) values (${owner.company.id}, ${b.id}, encode(sha256('tok-pro'::bytea), 'hex'))`);
    await crm.submitReview("tok-pro", 5, "Increíble", "Ana");
    expect(await crm.reviewByToken("tok-pro")).toMatchObject({ rating: 5, googleReviewUrl: "https://g.page/r/abc/review" });
  });
});

describe("operations", () => {
  const key = () => `${startsAt}|Alhambra`;
  it("lets only the tour's guide share the group's position, shown on the signed link around the tour", async () => {
    const ops = await import("@/lib/ops");
    await system((tx) => tx`update bookings set guide_member_id = ${guide.member.id} where tour_name = 'Alhambra' and company_id = ${owner.company.id}`);
    expect(await ruleCode(ops.shareLocation(guide2, key(), 37.17, -3.59))).toBe("forbidden");
    expect(await ruleCode(ops.shareLocation(guide, key(), 137, 0))).toBe("invalid");
    await ops.shareLocation(guide, key(), 37.176, -3.589);
    const link = ops.groupLink(owner.company.id, startsAt, "Alhambra")!;
    const g1 = await ops.groupWhere(link.split("/grupo/")[1]);
    expect(g1).toMatchObject({ tourName: "Alhambra", meetingPoint: "Puerta de la Justicia" });
    expect(g1!.live).toMatchObject({ lat: 37.176, lng: -3.589 });
    expect(await ops.groupWhere("forged.token")).toBeNull();
  });

  it("keeps notes per booking, swaps a tour to a free guide, and checks the equipment", async () => {
    const ops = await import("@/lib/ops");
    const [b] = await system((tx) => tx<{ id: string }[]>`select id from bookings where tour_name = 'Alhambra' and status <> 'cancelled' and company_id = ${owner.company.id} limit 1`);
    await ops.saveBookingNotes(guide, b.id, "Viene con carrito", 1);
    expect(await ruleCode(ops.saveBookingNotes(guide2, b.id, "x", 0))).toBe("forbidden");
    expect(await ruleCode(ops.requestSwap(guide2, key(), ""))).toBe("forbidden");
    const id = await ops.requestSwap(guide, key(), "Tengo médico");
    expect(await ops.requestSwap(guide, key(), "")).toBe(id); // one open request per tour
    expect((await ops.openSwaps(guide2)).map((w) => w.id)).toContain(id);
    expect(await ruleCode(ops.takeSwap(guide, id))).toBe("own");
    await ops.takeSwap(guide2, id);
    const [after] = await system((tx) => tx<{ guide: string }[]>`select guide_member_id as guide from bookings where id = ${b.id}`);
    expect(after.guide).toBe(guide2.member.id);
    expect(await ruleCode(ops.takeSwap(guide, id))).toBe("gone");
    await ops.toggleEquipment(guide2, key(), "Bandera", true);
    expect((await ops.equipmentState(guide2, key())).checked).toEqual(["Bandera"]);
    await ops.toggleEquipment(guide2, key(), "Bandera", false);
    expect((await ops.equipmentState(guide2, key())).checked).toEqual([]);
  });

  it("warns about rain during a tour, and shows nothing when the forecast is unavailable", async () => {
    const w = await import("@/lib/weather");
    const at = new Date(startsAt);
    const hours = [0, 1, 2].map((i) => ({ time: new Date(at.getTime() + i * 3600_000).toISOString(), rainChance: i === 1 ? 80 : 10, code: 61, tempC: 15 }));
    expect(w.rainAlerts(hours, [{ startsAt, tourName: "Alhambra", durationMin: 180 }])).toEqual([{ startsAt, tourName: "Alhambra", rainChance: 80 }]);
    expect(w.rainAlerts(hours, [{ startsAt: new Date(at.getTime() + 10 * 3600_000).toISOString(), tourName: "Late", durationMin: 60 }])).toEqual([]);
    expect(await w.forecast("Nowhere-xyz", async () => { throw new Error("offline"); })).toEqual([]);
    const fake = await w.forecast("Granada-test", async (u) => u.includes("geocoding") ? { results: [{ latitude: 37.1, longitude: -3.6 }] } : { hourly: { time: ["2026-11-10T10:00"], precipitation_probability: [70], weather_code: [61], temperature_2m: [14] } });
    expect(fake).toEqual([{ time: "2026-11-10T10:00:00Z", rainChance: 70, code: 61, tempC: 14 }]);
  });
});

describe("platforms", () => {
  it("serves OCTO: products, availability, a hold that blocks places, confirm into the calendar, cancel back", async () => {
    const octo = await import("@/lib/octo");
    const k = await octo.createApiKey(owner, "viator", "Viator test");
    expect(await ruleCode(octo.createApiKey(guide, "viator", "x"))).toBe("forbidden");
    await expect(octo.authenticate("Bearer nope")).rejects.toMatchObject({ status: 401 });
    const c = await octo.authenticate(`Bearer ${k}`);
    const prods = await octo.products(c);
    expect(prods.map((p) => p.internalName).sort()).toEqual(["Albaicín free", "Alhambra"]);
    const av = await octo.availability(c, { productId: tourId, localDateStart: day, localDateEnd: day });
    expect(av).toHaveLength(1);
    const before = av[0].vacancies;
    const hold = await octo.reserve(c, { productId: tourId, availabilityId: av[0].id, unitItems: [{ unitId: "adult" }, { unitId: "adult" }], resellerReference: "BR-1" });
    expect(hold.status).toBe("ON_HOLD");
    expect((await octo.availability(c, { productId: tourId, localDateStart: day, localDateEnd: day }))[0].vacancies).toBe(before - 2);
    await expect(octo.reserve(c, { productId: tourId, availabilityId: av[0].id, unitItems: Array.from({ length: 9 }, () => ({ unitId: "adult" })) })).rejects.toMatchObject({ error: "INVALID_UNIT_ITEMS" });
    const done = await octo.confirm(c, hold.uuid, { contact: { fullName: "Zoe Hart", emailAddress: "zoe@example.com", locales: ["en-GB"] } });
    expect(done.status).toBe("CONFIRMED");
    const [b] = await system((tx) => tx<{ platform: string; people: number; turnoCommissionCents: number }[]>`select platform, people, turno_commission_cents from bookings where external_ref = 'BR-1'`);
    expect(b).toEqual({ platform: "viator", people: 2, turnoCommissionCents: 0 });
    expect((await octo.confirm(c, hold.uuid, {})).status).toBe("CONFIRMED"); // idempotent
    const otherKey = await octo.createApiKey(other, "viator", "B");
    await expect(octo.getBooking(await octo.authenticate(`Bearer ${otherKey}`), hold.uuid)).rejects.toMatchObject({ error: "INVALID_BOOKING_UUID" });
    expect((await octo.cancel(c, hold.uuid)).status).toBe("CANCELLED");
    expect((await octo.availability(c, { productId: tourId, localDateStart: day, localDateEnd: day }))[0].vacancies).toBe(before);
  });

  it("imports a CSV of past bookings once, with Spanish dates and platform names", async () => {
    const imp = await import("@/lib/importer");
    expect(imp.parseCsv('a;b\n"x;1";"he said ""hi"""\n')).toEqual([["a", "b"], ["x;1", 'he said "hi"']]);
    const csv = "Fecha;Hora;Tour;Personas;Plataforma;Nombre;Email;Teléfono;Referencia;Importe;Estado\n04/10/2026;10:30;Albaicín free;4;GuruWalk;Laura;laura-imp@example.com;;GW9;;asistió\n2026-10-05;10:30;Albaicín free;2;freetour.com;Tom;;+447700900111;FT8;;no vino\nmal;xx;;;;;;;;;\n";
    expect(await imp.importCsv(owner, csv)).toEqual({ imported: 2, skipped: 0, errors: ["Fila 4: fecha u hora no válida"] });
    expect(await imp.importCsv(owner, csv)).toMatchObject({ imported: 0, skipped: 2 });
    const rows = await system((tx) => tx<{ platform: string; status: string }[]>`select platform, status from bookings where external_ref in ('GW9', 'FT8') order by external_ref`);
    expect(rows).toEqual([{ platform: "freetour", status: "no_show" }, { platform: "guruwalk", status: "attended" }]);
    expect(await ruleCode(imp.importCsv(guide, csv))).toBe("forbidden");
  });

  it("compares platforms by what each person leaves and how many do not show up", async () => {
    const { comparePlatforms } = await import("@/lib/compare");
    const rows = await comparePlatforms(owner);
    expect(rows.find((r) => r.platform === "freetour")).toMatchObject({ noShowPct: 100 });
    expect(rows.find((r) => r.platform === "guruwalk")).toMatchObject({ people: 4, noShowPct: 0 });
  });
});

describe("trust", () => {
  it("verifies a guide from private documents that the public media route never serves", async () => {
    const trust = await import("@/lib/trust");
    const media = await import("@/lib/media");
    expect(await ruleCode(trust.requestVerification(owner, [jpeg]))).toBe("missing");
    expect(await ruleCode(trust.requestVerification(guide, [jpeg, jpeg]))).toBe("forbidden");
    await trust.requestVerification(owner, [jpeg, jpeg]);
    expect(await ruleCode(trust.verificationQueue(owner.userId))).toBe("forbidden");
    await system((tx) => tx`insert into platform_admins (user_id) values (${other.userId}) on conflict do nothing`);
    const [q] = (await trust.verificationQueue(other.userId)).filter((x) => x.companyId === owner.company.id);
    expect(q.documents).toBe(2);
    expect(await media.photoBytes(q.documentIds[0])).toBeNull(); // not public
    expect(await trust.verificationDocument(owner.userId, q.documentIds[0])).toBeNull(); // not the owner either
    expect(await trust.verificationDocument(other.userId, q.documentIds[0])).not.toBeNull();
    await trust.decideVerification(other.userId, owner.company.id, true);
    expect((await mk.publicProfile("pro-a"))!.verifiedAt).not.toBeNull();
    const [{ n }] = await system((tx) => tx<{ n: number }[]>`select count(*)::int as n from media where company_id = ${owner.company.id} and owner_kind = 'verification'`);
    expect(n).toBe(0); // documents deleted after the decision
    await system((tx) => tx`delete from platform_admins where user_id = ${other.userId}`);
  });

  it("gives a referred business half commission for a month, and the referrer a month when it publishes", async () => {
    const trust = await import("@/lib/trust");
    const info = await trust.referralInfo(owner);
    const c = await db.createCompany({ companyName: "Pro C", industry: null, locationName: "Córdoba", timezone: TZ, ownerName: "Paz", ownerEmail: "pro-c@example.com" });
    expect(await trust.applyReferral(c.company.id, info.code.toLowerCase())).toBe(true);
    expect(await trust.applyReferral(c.company.id, "NOPE1234")).toBe(false);
    const paz = (await db.sessionForUser(c.userId))!;
    expect((await trust.referralInfo(paz)).reducedUntil).not.toBeNull();
    expect((await trust.referralInfo(owner)).invited).toBe(1);
    await mk.saveProfile(paz, { slug: "pro-c", headline: "", bio: "", city: "Córdoba", languages: [], specialities: [], videoUrl: null, published: true });
    expect((await trust.referralInfo(owner)).reducedUntil).not.toBeNull();
    // half commission on Paz's Turno sales: free plan 18 % → 9 %
    const t = await mk.saveTour(paz, { title: "Mezquita", description: null, meetingPoint: null, durationMin: 90, capacity: 10, priceModel: "per_person", priceCents: 2000, published: true, maxPeoplePerBooking: 5, weeklySlots: [{ weekday: weekday(day), time: "10:00" }] });
    const key = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
    try {
      const { bookingId } = await mk.book({ slug: "pro-c", tourId: t, startsAt: toInstant(day, "10:00", TZ).toISOString(), people: 1, name: "Q", email: "q@example.com", phone: null, language: "es" });
      const [b] = await system((tx) => tx<{ c: number }[]>`select turno_commission_cents as c from bookings where id = ${bookingId}`);
      expect(b.c).toBe(180);
    } finally { process.env.STRIPE_SECRET_KEY = key; }
  });
});

void g;
