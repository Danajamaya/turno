import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, system } from "@/lib/db";
import { handleWebhook } from "@/lib/billing";
import * as g from "@/lib/guides";
import * as db from "@/lib/store";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };
let a: Session, b: Session, addrA: string, addrB: string;

async function business(name: string, email: string) {
  const { userId } = await db.createCompany({ companyName: name, industry: "Tours", locationName: "Madrid", timezone: "Europe/Madrid", ownerName: `Guía ${name}`, ownerEmail: email });
  return (await db.sessionForUser(userId))!;
}
const mail = (to: string, over: Partial<g.InboundEmail> = {}): g.InboundEmail => ({
  to, from: "GuruWalk <noreply@guruwalk.com>", subject: "¡Nueva reserva!", messageId: `<${Math.random()}@guruwalk.com>`, authenticated: true,
  text: "Tour: Free tour Madrid\nFecha: 14/11/2026\nHora: 10:30\nPersonas: 3\nNombre: Laura Gómez\nTeléfono: +34 600 123 456\nReserva nº: GW48213",
  ...over,
});

beforeAll(async () => {
  a = await business("GA", "guia-a@example.com");
  b = await business("GB", "guia-b@example.com");
  addrA = await g.forwardingAddress(a);
  addrB = await g.forwardingAddress(b);
});
afterAll(() => sql.end());

describe("email ingestion", () => {
  it("gives each company a stable, different forwarding address", async () => {
    expect(addrA).toMatch(/^r-[a-z0-9]+@/);
    expect(await g.forwardingAddress(a)).toBe(addrA);
    expect(addrA).not.toBe(addrB);
  });

  it("imports a booking once, even if the email arrives twice or is forwarded again", async () => {
    const m = mail(addrA);
    const first = await g.ingestEmail(m);
    expect(first.status).toBe("imported");
    expect((await g.ingestEmail(m)).status).toBe("duplicate");
    expect((await g.ingestEmail({ ...m, messageId: "<other@x>" })).status).toBe("imported"); // same booking ref
    const cal = await g.calendar(a, new Date("2026-11-01"), new Date("2026-12-01"));
    expect(cal).toHaveLength(1);
    expect(cal[0]).toMatchObject({ platform: "guruwalk", externalRef: "GW48213", people: 3, travellerName: "Laura Gómez", status: "confirmed" });
    expect(cal[0].startsAt).toBe("2026-11-14T09:30:00.000Z"); // 10:30 in Madrid
    expect(await g.calendar(b, new Date("2026-11-01"), new Date("2026-12-01"))).toHaveLength(0);
  });

  it("applies cancellations, including one that arrives before its booking", async () => {
    await g.ingestEmail(mail(addrA, { subject: "Reserva cancelada", text: "La reserva nº: GW48213 ha sido cancelada." }));
    let [x] = await g.calendar(a, new Date("2026-11-01"), new Date("2026-12-01"));
    expect(x.status).toBe("cancelled");
    expect((await g.ingestEmail(mail(addrA, { subject: "Booking cancelled", text: "Booking ID: GW77001 cancelled" }))).status).toBe("cancel_pending");
    await g.ingestEmail(mail(addrA, { text: "Fecha: 15/11/2026\nHora: 12:00\nPersonas: 2\nReserva nº: GW77001" }));
    x = (await g.calendar(a, new Date("2026-11-15"), new Date("2026-11-16")))[0];
    expect(x).toMatchObject({ externalRef: "GW77001", status: "cancelled" });
  });

  it("sends unsure, unauthenticated or unknown-sender emails to review or ignores them", async () => {
    expect(await g.ingestEmail(mail(addrA, { text: "Tienes una nueva reserva para el 20/11/2026" }))).toMatchObject({ status: "needs_review" });
    expect(await g.ingestEmail(mail(addrA, { authenticated: false, text: "Fecha: 21/11/2026\nHora: 10:00\nPersonas: 2\nReserva nº: GW1234567" }))).toMatchObject({ status: "needs_review" });
    expect(await g.ingestEmail(mail(addrA, { from: "spam@gmail.com" }))).toMatchObject({ status: "ignored" });
    expect(await g.ingestEmail(mail("r-doesnotexist@x.com"))).toEqual({ status: "unknown_address" });
    const queue = await g.reviewQueue(a);
    expect(queue).toHaveLength(2);
    expect(await g.reviewQueue(b)).toHaveLength(0);
  });

  it("lets the guide fix a reviewed email into a booking", async () => {
    const [item] = (await g.reviewQueue(a)).filter((q) => q.subject === "¡Nueva reserva!" && q.extracted.date === "2026-11-20");
    await g.resolveReview(a, item.id, { platform: "guruwalk", kind: "new", externalRef: "GW90001", date: "2026-11-20", time: "11:00", people: 4, tourName: "Free tour Madrid", travellerName: null });
    const cal = await g.calendar(a, new Date("2026-11-20"), new Date("2026-11-21"));
    expect(cal[0]).toMatchObject({ externalRef: "GW90001", people: 4 });
    expect(await ruleCode(g.resolveReview(a, item.id, "ignore"))).toBe("not_found"); // already done
    expect(await ruleCode(g.resolveReview(b, (await g.reviewQueue(a))[0].id, "ignore"))).toBe("not_found"); // other company
  });
});

describe("money", () => {
  it("computes the guide's net per channel: platform fees out, tips in", async () => {
    await g.setChannelFee(a, "freetour", 300); // €3 per person charged by the platform
    await g.ingestEmail(mail(addrA, { from: "Freetour <bookings@freetour.com>", text: "Date: 16/11/2026\nTime: 11:00\nParticipants: 5\nBooking ID: FT-12345" }));
    const [ft] = await g.calendar(a, new Date("2026-11-16"), new Date("2026-11-17"));
    await g.closeBooking(a, ft.id, { attended: true, tipsCents: 6000 });
    const { rows, total } = await g.guideIncome(a, new Date("2026-11-01"), new Date("2026-12-01"));
    const freetour = rows.find((r) => r.platform === "freetour")!;
    expect(freetour).toMatchObject({ bookings: 1, people: 5, platformFeeCents: 1500, tipsCents: 6000, netCents: 4500 });
    expect(total.bookings).toBe(2); // the cancelled ones do not count
  });

  it("shows Turno's earnings only to platform admins, from Stripe invoices", async () => {
    expect(await ruleCode(g.platformEarnings(a.userId, new Date("2026-01-01"), new Date("2027-01-01")))).toBe("forbidden");
    await system((tx) => tx`update companies set stripe_customer_id = 'cus_A' where id = ${a.company.id}`);
    const stripe = new Stripe("sk_test_dummy");
    const body = JSON.stringify({ id: "evt_inv_1", object: "event", type: "invoice.paid",
      data: { object: { id: "in_1", object: "invoice", customer: "cus_A", amount_paid: 1900, currency: "eur", created: 1_793_000_000 } } });
    const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test" });
    await handleWebhook(body, sig);
    await handleWebhook(body, sig); // retry: no double counting
    await system((tx) => tx`insert into platform_admins (user_id) values (${b.userId})`);
    const e = await g.platformEarnings(b.userId, new Date("2026-01-01"), new Date("2027-01-01"));
    expect(e.byMonth).toEqual([{ month: "2026-10", kind: "subscription", cents: 1900, currency: "EUR" }]);
    expect(e.counts.companies).toBeGreaterThanOrEqual(2);
  });
});
