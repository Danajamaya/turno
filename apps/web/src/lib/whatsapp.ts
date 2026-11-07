// WhatsApp Business (Cloud API): messages travellers send to the business's
// number land in Mensajes as a conversation, frequent questions get an
// automatic answer from the business's own tour data, and replies written in
// Mensajes go back by WhatsApp. Needs WHATSAPP_TOKEN, WHATSAPP_APP_SECRET and
// WHATSAPP_VERIFY_TOKEN, plus the business's phone number id in settings.
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { system } from "./db";
import { facts, templateReplies } from "./inquiries";
import { notifyMembers } from "./push";
import { RuleError } from "./types";

export const whatsappOn = () => !!process.env.WHATSAPP_TOKEN;

/** Meta signs each webhook delivery with the app secret. */
export function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const want = createHmac("sha256", secret).update(raw).digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function sendWhatsApp(phoneNumberId: string, to: string, body: string, send: typeof fetch = fetch): Promise<void> {
  if (!whatsappOn()) throw new RuleError("whatsapp_off", "WhatsApp todavía no está conectado.");
  const res = await send(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "text", text: { body: body.slice(0, 4000) } }),
  });
  if (!res.ok) throw new Error(`whatsapp send ${res.status}`);
}

interface Incoming { phoneNumberId: string; from: string; name: string; text: string }

/** Pull the text messages out of a Cloud API webhook payload. Pure. */
export function readPayload(payload: unknown): Incoming[] {
  const out: Incoming[] = [];
  const entries = (payload as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: { from?: string; type?: string; text?: { body?: string } }[] } }[] }[] })?.entry ?? [];
  for (const e of entries) for (const c of e.changes ?? []) {
    const v = c.value, id = v?.metadata?.phone_number_id;
    for (const m of v?.messages ?? []) {
      if (!id || !m.from || m.type !== "text" || !m.text?.body) continue;
      out.push({ phoneNumberId: id, from: m.from, name: v?.contacts?.find((x) => x.wa_id === m.from)?.profile?.name ?? "", text: m.text.body });
    }
  }
  return out;
}

const guessLang = (phone: string) => (phone.startsWith("34") || phone.startsWith("52") || phone.startsWith("54") ? "es" : "en");

/** Store each incoming message in its conversation and answer frequent questions automatically. Returns auto-replies sent. */
export async function handleIncoming(messages: Incoming[], send: typeof fetch = fetch): Promise<number> {
  let auto = 0;
  for (const m of messages) {
    const hit = await system(async (tx) => {
      const [c] = await tx<{ id: string; autoReply: boolean }[]>`select id, whatsapp_auto_reply as auto_reply from companies where whatsapp_phone_id = ${m.phoneNumberId}`;
      if (!c) return null;
      const lang = guessLang(m.from);
      let [inq] = await tx<{ id: string }[]>`select id from inquiries where company_id = ${c.id} and channel = 'whatsapp' and phone = ${m.from} order by last_message_at desc limit 1`;
      if (!inq) {
        [inq] = await tx<{ id: string }[]>`insert into inquiries (company_id, name, email, language, token_hash, channel, phone)
          values (${c.id}, ${m.name || `+${m.from}`}, '', ${lang}, ${createHash("sha256").update(randomBytes(16)).digest("hex")}, 'whatsapp', ${m.from}) returning id`;
      }
      await tx`insert into inquiry_messages (inquiry_id, company_id, from_traveller, body) values (${inq.id}, ${c.id}, true, ${m.text.slice(0, 4000)})`;
      await tx`update inquiries set status = 'open', last_message_at = now() where id = ${inq.id}`;
      return { companyId: c.id, inquiryId: inq.id, autoReply: c.autoReply, lang };
    });
    if (!hit) continue;
    await notifyMembers(hit.companyId, { managers: true }, { title: `WhatsApp de ${m.name || "+" + m.from}`, body: m.text.slice(0, 120), url: "/mensajes?tab=preguntas" }).catch(() => 0);
    if (!hit.autoReply || !whatsappOn()) continue;
    const drafts = templateReplies(m.text, await facts(hit.companyId), hit.lang === "en");
    if (drafts.length < 2) continue; // only the generic answer matched: leave it to a person
    const body = `${drafts[0]}\n\n${hit.lang === "en" ? "(Automatic answer. A person will reply if you need more.)" : "(Respuesta automática. Si necesitas algo más, te contesta una persona.)"}`;
    try {
      await sendWhatsApp(m.phoneNumberId, m.from, body, send);
      await system((tx) => tx`insert into inquiry_messages (inquiry_id, company_id, from_traveller, body) values (${hit.inquiryId}, ${hit.companyId}, false, ${body})`);
      auto++;
    } catch (e) { console.error("whatsapp auto-reply failed", e); }
  }
  return auto;
}
