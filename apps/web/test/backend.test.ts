import { promises as fs } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shiftInterval, localDate, weekStartOf, toInstant } from "@turno/core";
import { sql, system, withUser } from "@/lib/db";
import * as auth from "@/lib/auth";
import { handleWebhook } from "@/lib/billing";
import * as db from "@/lib/store";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const TZ = "America/Chicago";
const outbox = path.join(process.cwd(), ".data", "outbox.jsonl");
const readOutbox = async () => (await fs.readFile(outbox, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };

let a: Session, b: Session, ana: Session;
const today = localDate(new Date(), TZ);
const week = weekStartOf(today, 1);

async function business(name: string, email: string) {
  const { userId } = await db.createCompany({ companyName: name, industry: null, locationName: "Centro", timezone: TZ, ownerName: `Dueño ${name}`, ownerEmail: email });
  return (await db.sessionForUser(userId))!;
}

beforeAll(async () => {
  await fs.rm(outbox, { force: true });
  a = await business("A", "owner-a@example.com");
  b = await business("B", "owner-b@example.com");
  const m = await db.addMember(a, { fullName: "Ana Torres", email: "ana@example.com", phone: null, role: "employee", jobTitle: "Cocinera", wageCents: 1850 });
  await system((tx) => tx`update members set status = 'active' where id = ${m.id}`);
  ana = (await db.sessionForUser(m.userId!))!;
});
afterAll(() => sql.end());

describe("tenant isolation", () => {
  it("a second company sees none of the first company's rows", async () => {
    const s = shiftInterval(today, "09:00", "17:00", TZ);
    const shift = await db.createShift(a, week, { memberId: ana.member.id, jobTitle: null, ...s, unpaidBreakMin: 0, note: null });
    const people = await db.listMembers(b);
    expect(people.map((p) => p.fullName)).toEqual(["Dueño B"]);
    const raw = await withUser(b.userId, (tx) => tx`select id from shifts`);
    expect(raw).toHaveLength(0);
    const foreign: [string, string][] = [
      ["members", `company_id <> '${b.company.id}'`], ["locations", `company_id <> '${b.company.id}'`],
      ["schedule_weeks", `company_id <> '${b.company.id}'`], ["time_cards", `company_id <> '${b.company.id}'`],
      ["companies", `id <> '${b.company.id}'`], ["users", `id <> '${b.userId}'`],
    ];
    for (const [table, where] of foreign) {
      const rows = await withUser(b.userId, (tx) => tx.unsafe(`select 1 from ${table} where ${where}`));
      expect(rows, table).toHaveLength(0);
    }
    await db.deleteShift(b, shift.id); // B cannot delete A's shift
    const [still] = await system((tx) => tx`select 1 from shifts where id = ${shift.id}`);
    expect(still).toBeTruthy();
    await db.deleteShift(a, shift.id);
  });

  it("an employee cannot call manager-only operations or write time cards directly", async () => {
    expect(await ruleCode(db.getWeek(ana, week))).toBe("forbidden");
    expect(await ruleCode(db.addMember(ana, { fullName: "X", email: "x@example.com", phone: null, role: "employee", jobTitle: null, wageCents: 0 }))).toBe("forbidden");
    await expect(withUser(ana.userId, (tx) => tx`insert into time_cards (company_id, location_id, member_id, clock_in_at, source)
      values (${a.company.id}, ${a.location.id}, ${ana.member.id}, now(), 'web')`)).rejects.toThrow(/row-level security/);
  });
});

describe("scheduling", () => {
  it("rejects double booking and hides drafts from employees until published", async () => {
    const s = shiftInterval(today, "22:00", "06:00", TZ);
    await db.createShift(a, week, { memberId: ana.member.id, jobTitle: "Cocinera", ...s, unpaidBreakMin: 30, note: null });
    const overlap = shiftInterval(today, "23:00", "02:00", TZ);
    expect(await ruleCode(db.createShift(a, week, { memberId: ana.member.id, jobTitle: null, ...overlap, unpaidBreakMin: 0, note: null }))).toBe("double_booked");

    const range = { from: toInstant(today, "00:00", TZ), to: toInstant(today, "23:59", TZ) };
    expect(await db.myPublishedShifts(ana, range.from, range.to)).toHaveLength(0);
    const raw = await withUser(ana.userId, (tx) => tx`select id from shifts`);
    expect(raw).toHaveLength(0);

    await fs.rm(outbox, { force: true });
    expect((await db.publishWeek(a, week)).notified).toBe(1);
    expect((await readOutbox()).map((m) => m.to)).toEqual(["ana@example.com"]);
    expect(await db.myPublishedShifts(ana, range.from, range.to)).toHaveLength(1);
    expect((await db.publishWeek(a, week)).notified).toBe(0); // nothing changed, nobody bothered
  });
});

describe("time clock", () => {
  it("allows one open card at a time and stores the punch server-side", async () => {
    // at the start of tonight's published 22:00 shift, so the early clock-in rule passes
    const start = shiftInterval(today, "22:00", "06:00", TZ).startAt;
    expect(await ruleCode(db.clockIn(ana, new Date(start.getTime() - 30 * 60_000)))).toBe("too_early");
    const card = await db.clockIn(ana, start);
    expect(card.memberId).toBe(ana.member.id);
    expect(await ruleCode(db.clockIn(ana, start))).toBe("already_clocked_in");
    const [x, y] = await Promise.allSettled([db.clockIn(ana, start), db.clockIn(ana, start)]);
    expect([x.status, y.status]).toEqual(["rejected", "rejected"]);
    const out = await db.clockOut(ana, new Date(start.getTime() + 8 * 3600_000));
    expect(out.clockOutAt).not.toBeNull();
    expect(await ruleCode(db.clockOut(ana))).toBe("not_clocked_in");
    // a double tap from a closed state: exactly one card, the other gets a clean error
    const race = await Promise.allSettled([db.clockIn(ana, start), db.clockIn(ana, start)]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = race.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(RuleError);
    await db.clockOut(ana, new Date(start.getTime() + 9 * 3600_000));
    expect(await db.approveCards(a, [out.id])).toBe(1);
    expect(await db.approveCards(b, [out.id])).toBe(0);
  });
});

describe("sign-in links", () => {
  it("emails a single-use link only to known addresses", async () => {
    await fs.rm(outbox, { force: true });
    await auth.requestSignInLink("nobody@example.com");
    expect(await readOutbox()).toHaveLength(0);
    await auth.requestSignInLink("OWNER-A@example.com");
    const [mail] = await readOutbox();
    const token = /token=([\w-]+)/.exec(mail.text)![1];
    const session = await auth.consumeSignInToken(token);
    expect(await auth.userIdForSession(session)).toBe(a.userId);
    expect(await ruleCode(auth.consumeSignInToken(token))).toBe("invalid_link");
    await auth.endAllSessions(a.userId);
    expect(await auth.userIdForSession(session)).toBeNull();
  });

  it("rejects expired links and stops sending after five an hour", async () => {
    await system((tx) => tx`delete from auth_tokens`);
    await fs.rm(outbox, { force: true });
    for (let i = 0; i < 7; i++) await auth.requestSignInLink("owner-b@example.com");
    const mails = await readOutbox();
    expect(mails).toHaveLength(5);
    await system((tx) => tx`update auth_tokens set expires_at = now() - interval '1 minute'`);
    const token = /token=([\w-]+)/.exec(mails[4].text)![1];
    expect(await ruleCode(auth.consumeSignInToken(token))).toBe("invalid_link");
  });
});

describe("plans and billing webhooks", () => {
  it("caps the free plan at ten people", async () => {
    for (let i = 0; i < 9; i++) await db.addMember(b, { fullName: `P${i}`, email: null, phone: `555010${String(i).padStart(4, "0")}`, role: "employee", jobTitle: null, wageCents: 0 });
    expect(await ruleCode(db.addMember(b, { fullName: "Once", email: null, phone: "5550109999", role: "employee", jobTitle: null, wageCents: 0 }))).toBe("plan_limit");
  });

  it("applies a signed subscription event once and ignores the retry", async () => {
    const stripe = new Stripe("sk_test_dummy");
    const event = {
      id: "evt_1", object: "event", type: "customer.subscription.updated",
      data: { object: { id: "sub_1", object: "subscription", status: "active", metadata: { company_id: b.company.id },
        items: { data: [{ price: { id: "price_plus" }, quantity: 2, current_period_end: 1_900_000_000 }] } } },
    };
    const body = JSON.stringify(event);
    const sig = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test" });
    expect(await handleWebhook(body, sig)).toBe(true);
    expect(await handleWebhook(body, sig)).toBe(false);
    const sub = await db.subscriptionFor(b);
    expect([sub.plan, sub.status, sub.locationQuantity]).toEqual(["plus", "active", 2]);
    expect(await ruleCode(handleWebhook(body, "t=1,v1=bad"))).toBe("bad_signature");
    expect(await ruleCode(handleWebhook(body.replace("active", "canceled"), sig))).toBe("bad_signature");
    // now on Plus, the free cap no longer applies
    await db.addMember(b, { fullName: "Once", email: null, phone: "5550109999", role: "employee", jobTitle: null, wageCents: 0 });
  });
});

describe("account deletion", () => {
  it("refuses an owner and deletes an employee while keeping payroll records", async () => {
    expect(await ruleCode(auth.deleteAccount(a.userId))).toBe("owner");
    await auth.deleteAccount(ana.userId);
    const [user] = await system((tx) => tx`select 1 from users where id = ${ana.userId}`);
    expect(user).toBeUndefined();
    const [m] = await system((tx) => tx<{ status: string; email: string | null }[]>`select status, email from members where id = ${ana.member.id}`);
    expect(m).toEqual({ status: "archived", email: null });
    const cards = await system((tx) => tx`select 1 from time_cards where member_id = ${ana.member.id}`);
    expect(cards.length).toBeGreaterThan(0);
  });
});
