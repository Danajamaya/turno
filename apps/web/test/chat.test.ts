import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, system, withUser } from "@/lib/db";
import * as chat from "@/lib/chat";
import * as db from "@/lib/store";
import type { Session } from "@/lib/types";
import { RuleError } from "@/lib/types";

const ruleCode = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { if (e instanceof RuleError) return e.code; throw e; } };
let owner: Session, diego: Session, sara: Session, other: Session;

async function person(s: Session, name: string, email: string) {
  const m = await db.addMember(s, { fullName: name, email, phone: null, role: "employee", jobTitle: "Guía", wageCents: 0 });
  await system((tx) => tx`update members set status = 'active' where id = ${m.id}`);
  return (await db.sessionForUser(m.userId!))!;
}

beforeAll(async () => {
  const a = await db.createCompany({ companyName: "Chat A", industry: null, locationName: "Madrid", timezone: "Europe/Madrid", ownerName: "Lucía", ownerEmail: "chat-owner@example.com" });
  owner = (await db.sessionForUser(a.userId))!;
  diego = await person(owner, "Diego", "chat-diego@example.com");
  sara = await person(owner, "Sara", "chat-sara@example.com");
  const b = await db.createCompany({ companyName: "Chat B", industry: null, locationName: "Roma", timezone: "Europe/Rome", ownerName: "Marco", ownerEmail: "chat-b@example.com" });
  other = (await db.sessionForUser(b.userId))!;
});
afterAll(() => sql.end());

describe("team chat", () => {
  it("creates the default channels once and everyone on the team sees them", async () => {
    await chat.ensureDefaultChannels(diego);
    await chat.ensureDefaultChannels(owner);
    const names = (await chat.listChannels(sara)).map((c) => c.name);
    expect(names).toEqual(["general", "avisos-del-dia", "cambios-de-turno"]);
    await chat.ensureDefaultChannels(other);
    expect((await chat.listChannels(other)).map((c) => c.name)).toEqual(["general", "avisos-del-dia", "cambios-de-turno"]);
  });

  it("delivers messages with unread counts, and reading clears them", async () => {
    const general = (await chat.listChannels(owner)).find((c) => c.name === "general")!;
    await chat.send(owner, general.id, "Hoy el Austrias va lleno, llevad bandera");
    await chat.send(owner, general.id, "Y paraguas", { type: "tour", startsAt: new Date().toISOString(), tourName: "Austrias", people: 24, platforms: ["guruwalk"] });
    expect((await chat.listChannels(diego)).find((c) => c.id === general.id)!.unread).toBe(2);
    expect((await chat.listChannels(owner)).find((c) => c.id === general.id)!.unread).toBe(0); // own messages are read
    const msgs = await chat.messages(diego, general.id);
    expect(msgs.map((m) => m.body)).toEqual(["Hoy el Austrias va lleno, llevad bandera", "Y paraguas"]);
    expect(msgs[1].attachment).toMatchObject({ type: "tour", people: 24 });
    expect(msgs[0].authorName).toBe("Lucía");
    await chat.markRead(diego, general.id);
    expect(await chat.unreadTotal(diego)).toBe(0);
  });

  it("keeps direct messages between their two people", async () => {
    const dm = await chat.openDirect(diego, sara.member.id);
    expect(await chat.openDirect(sara, diego.member.id)).toBe(dm); // same conversation from either side
    await chat.send(diego, dm, "¿Me cubres el Prado del martes?");
    expect((await chat.messages(sara, dm)).map((m) => m.body)).toEqual(["¿Me cubres el Prado del martes?"]);
    expect((await chat.listChannels(sara)).find((c) => c.id === dm)).toMatchObject({ kind: "direct", name: "Diego", unread: 1 });
    // the owner is on the team but not in this conversation
    expect(await chat.messages(owner, dm)).toEqual([]);
    expect((await chat.listChannels(owner)).some((c) => c.id === dm)).toBe(false);
    expect(await ruleCode(chat.send(owner, dm, "hola"))).toBe("not_found");
  });

  it("isolates companies and forbids posting as someone else", async () => {
    const general = (await chat.listChannels(owner)).find((c) => c.name === "general")!;
    expect(await chat.messages(other, general.id)).toEqual([]);
    expect(await ruleCode(chat.send(other, general.id, "hola"))).toBe("not_found");
    expect(await ruleCode(chat.openDirect(other, diego.member.id))).toBe("not_found");
    await expect(withUser(diego.userId, (tx) => tx`insert into chat_messages (company_id, channel_id, member_id, body)
      values (${owner.company.id}, ${general.id}, ${sara.member.id}, 'soy Sara')`)).rejects.toThrow(/row-level security/);
  });

  it("lets only managers create channels", async () => {
    expect(await ruleCode(chat.createChannel(diego, "fiesta", null))).toBe("forbidden");
    const id = await chat.createChannel(owner, "Tour Prado", "Todo sobre el Prado");
    expect((await chat.listChannels(diego)).find((c) => c.id === id)!.name).toBe("tour-prado");
    expect(await ruleCode(chat.createChannel(owner, "tour prado", null))).toBe("exists");
  });
});
