// Questions from travellers before they book. The traveller writes from the
// guide's public page; the business answers from Mensajes; every reply goes by
// email with a private link where the traveller can read the thread and answer.
// Suggested replies come from Claude when ANTHROPIC_API_KEY is set, and from
// the business's own tour data otherwise.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { system, withUser, type Tx } from "./db";
import { appUrl, sendEmail } from "./email";
import { notifyMembers } from "./push";
import type { Session } from "./types";
import { RuleError } from "./types";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export interface Ask { slug: string; name: string; email: string; body: string; language: "es" | "en"; kind?: "question" | "quote"; details?: { people: number; date: string | null; groupKind: string } }

/** A traveller asks something from the public page. Returns nothing the traveller could use to read others' threads. */
export async function ask(a: Ask): Promise<void> {
  const body = a.body.trim();
  if (body.length < 3) throw new RuleError("empty", a.language === "en" ? "Write your question." : "Escribe tu pregunta.");
  const token = randomBytes(18).toString("base64url");
  const { companyId, companyName, managers } = await system(async (tx) => {
    const [p] = await tx<{ companyId: string; companyName: string }[]>`
      select gp.company_id, c.name as company_name from guide_profiles gp join companies c on c.id = gp.company_id where gp.slug = ${a.slug} and gp.published`;
    if (!p) throw new RuleError("not_found", "Esta página ya no está disponible.");
    const [traveller] = await tx<{ id: string }[]>`
      insert into travellers (company_id, name, email, language, first_platform) values (${p.companyId}, ${a.name}, ${a.email}, ${a.language}, 'turno')
      on conflict (company_id, lower(email)) where email is not null do update set name = case when travellers.name = '' then excluded.name else travellers.name end
      returning id`;
    const [inq] = await tx<{ id: string }[]>`insert into inquiries (company_id, traveller_id, name, email, language, token_hash, kind, details)
      values (${p.companyId}, ${traveller.id}, ${a.name}, ${a.email}, ${a.language}, ${hashToken(token)}, ${a.kind ?? "question"}, ${a.details ? tx.json(a.details as never) : null}) returning id`;
    await tx`insert into inquiry_messages (inquiry_id, company_id, from_traveller, body) values (${inq.id}, ${p.companyId}, true, ${body.slice(0, 4000)})`;
    const managers = await tx<{ email: string }[]>`select email from members where company_id = ${p.companyId} and role in ('owner','manager') and status <> 'archived' and email is not null`;
    return { ...p, managers };
  });
  for (const m of managers) await sendEmail({ to: m.email, subject: a.kind === "quote" ? `Presupuesto para ${a.details?.people ?? "un"} personas: ${a.name}` : `Pregunta de ${a.name}`, text: `${a.name} pregunta desde tu página:\n\n«${body}»\n\nContesta desde Turno: ${appUrl()}/mensajes?tab=preguntas\n` });
  await notifyMembers(companyId, { managers: true }, { title: `Pregunta de ${a.name}`, body: body.slice(0, 120), url: "/mensajes?tab=preguntas" });
  await sendEmail({ to: a.email, subject: a.language === "en" ? `Your question to ${companyName}` : `Tu pregunta a ${companyName}`,
    text: a.language === "en" ? `We sent your question to ${companyName}. You'll get the answer by email.\nFollow the conversation here: ${appUrl()}/consulta/${token}\n`
      : `Mandamos tu pregunta a ${companyName}. Te llegará la respuesta por correo.\nSigue la conversación aquí: ${appUrl()}/consulta/${token}\n` });
}

export interface Inquiry { id: string; name: string; email: string; language: "es" | "en"; status: string; lastMessageAt: string; kind: "question" | "quote"; details: { people: number; date: string | null; groupKind: string } | null; channel: "email" | "whatsapp"; phone: string | null; messages: { fromTraveller: boolean; body: string; createdAt: string; memberName: string | null }[] }

async function threadsWhere(companyId: string | null, inquiryId: string | null, tokenHash: string | null, userId: string | null): Promise<(Inquiry & { companyId: string; companyName: string })[]> {
  const q = async (tx: Tx) => {
    const list = await tx<(Omit<Inquiry, "messages"> & { companyId: string; companyName: string })[]>`
      select i.id, i.name, i.email, i.language, i.status, i.last_message_at, i.kind, i.details, i.channel, i.phone, i.company_id, c.name as company_name
      from inquiries i join companies c on c.id = i.company_id
      where true ${companyId ? tx`and i.company_id = ${companyId}` : tx``} ${inquiryId ? tx`and i.id = ${inquiryId}` : tx``} ${tokenHash ? tx`and i.token_hash = ${tokenHash}` : tx``}
      order by (i.status = 'open') desc, i.last_message_at desc limit 50`;
    if (!list.length) return [];
    const msgs = await tx<{ inquiryId: string; fromTraveller: boolean; body: string; createdAt: string; memberName: string | null }[]>`
      select m.inquiry_id, m.from_traveller, m.body, m.created_at, mb.full_name as member_name from inquiry_messages m left join members mb on mb.id = m.member_id
      where m.inquiry_id = any(${list.map((x) => x.id)}::uuid[]) order by m.created_at`;
    return list.map((x) => ({ ...x, messages: msgs.filter((m) => m.inquiryId === x.id) }));
  };
  return userId ? withUser(userId, q) : system(q);
}

/** Open and answered questions for the business (managers). */
export async function inquiries(s: Session): Promise<Inquiry[]> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede ver las preguntas de viajeros.");
  return threadsWhere(s.company.id, null, null, s.userId);
}

/** The traveller's own thread, by the private link. */
export async function inquiryByToken(token: string) {
  const [t] = await threadsWhere(null, null, hashToken(token), null);
  return t ?? null;
}

export async function reply(s: Session, inquiryId: string, body: string): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede contestar.");
  const text = body.trim();
  if (!text) throw new RuleError("empty", "Escribe la respuesta.");
  const [t] = await threadsWhere(s.company.id, inquiryId, null, s.userId);
  if (!t) throw new RuleError("not_found", "Esa pregunta no existe.");
  const token = randomBytes(18).toString("base64url"); // a fresh link; the old one stops working
  await withUser(s.userId, async (tx) => {
    await tx`insert into inquiry_messages (inquiry_id, company_id, from_traveller, member_id, body) values (${t.id}, ${s.company.id}, false, ${s.member.id}, ${text.slice(0, 4000)})`;
    await tx`update inquiries set status = 'answered', last_message_at = now(), token_hash = ${hashToken(token)} where id = ${t.id}`;
  });
  const en = t.language === "en";
  if (t.channel === "whatsapp" && t.phone) {
    const [c] = await system((tx) => tx<{ phoneId: string | null }[]>`select whatsapp_phone_id as phone_id from companies where id = ${s.company.id}`);
    if (!c.phoneId) throw new RuleError("whatsapp_off", "Conecta tu número de WhatsApp Business en Configuración para contestar por WhatsApp.");
    await (await import("./whatsapp")).sendWhatsApp(c.phoneId, t.phone, text);
    return;
  }
  await sendEmail({ to: t.email, subject: en ? `${t.companyName} answered your question` : `${t.companyName} contestó tu pregunta`,
    text: `${text}\n\n— ${s.member.fullName}, ${t.companyName}\n\n${en ? "Reply here" : "Contesta aquí"}: ${appUrl()}/consulta/${token}\n` });
}

/** The traveller answers back through the private link. */
export async function travellerReply(token: string, body: string): Promise<void> {
  const t = await inquiryByToken(token);
  if (!t) throw new RuleError("not_found", "Este enlace no es válido.");
  const text = body.trim();
  if (!text) throw new RuleError("empty", t.language === "en" ? "Write your message." : "Escribe tu mensaje.");
  await system(async (tx) => {
    await tx`insert into inquiry_messages (inquiry_id, company_id, from_traveller, body) values (${t.id}, ${t.companyId}, true, ${text.slice(0, 4000)})`;
    await tx`update inquiries set status = 'open', last_message_at = now() where id = ${t.id}`;
  });
  await notifyMembers(t.companyId, { managers: true }, { title: `Respuesta de ${t.name}`, body: text.slice(0, 120), url: "/mensajes?tab=preguntas" });
}

// ------------------------------------------------------------- suggested replies

interface Facts { companyName: string; bio: string; tours: { title: string; durationMin: number; meetingPoint: string | null; priceModel: string; priceCents: number; currency: string; times: string[] }[] }

export async function facts(companyId: string): Promise<Facts> {
  return system(async (tx) => {
    const [c] = await tx<{ companyName: string; bio: string | null }[]>`select c.name as company_name, gp.bio from companies c left join guide_profiles gp on gp.company_id = c.id where c.id = ${companyId}`;
    const tours = await tx<{ title: string; durationMin: number; meetingPoint: string | null; priceModel: string; priceCents: number; currency: string; weeklySlots: { weekday: number; time: string }[] }[]>`
      select title, duration_min, meeting_point, price_model, price_cents, currency, weekly_slots from tours where company_id = ${companyId} and published order by sort`;
    return { companyName: c.companyName, bio: c.bio ?? "", tours: tours.map((t) => ({ ...t, times: [...new Set(t.weeklySlots.map((x) => x.time))].sort() })) };
  });
}

const price = (t: Facts["tours"][number], en: boolean) => t.priceModel === "free_tip" ? (en ? "pay what you want at the end" : "a la voluntad, al final")
  : `${(t.priceCents / 100).toFixed(0)} ${t.currency} ${t.priceModel === "per_person" ? (en ? "per person" : "por persona") : (en ? "per group" : "por grupo")}`;

/** Drafts written from the business's own data, matched on what the question is about. Always available. */
export function templateReplies(question: string, f: Facts, en: boolean): string[] {
  const q = question.toLowerCase(), out: string[] = [];
  const first = f.tours[0];
  if (/silla|wheel|accesib|access|movilidad|mobility/.test(q)) out.push(en ? "Yes, most of the route is step-free. Tell us who is coming and we will adapt the pace and the stops." : "Sí, casi todo el recorrido es sin escalones. Dinos quién viene y adaptamos el ritmo y las paradas.");
  if (/precio|cuesta|price|cost|pagar|pay/.test(q) && f.tours.length) out.push(f.tours.map((t) => `${t.title}: ${price(t, en)}.`).join(" "));
  if (/dónde|donde|where|punto|meeting|encuentro/.test(q) && first?.meetingPoint) out.push(en ? `We meet at ${first.meetingPoint}. Look for the guide with the flag, 5 minutes before the start.` : `Quedamos en ${first.meetingPoint}. Busca al guía con la bandera, 5 minutos antes de empezar.`);
  if (/niñ|kid|child|famil|bebé|baby/.test(q)) out.push(en ? "Children are very welcome. The route is easy to walk and we keep the stories fun for them." : "Los niños son muy bienvenidos. La ruta es fácil de caminar y contamos las historias para que les diviertan.");
  if (/hora|time|when|cuándo|cuando|dur/.test(q) && first) out.push(f.tours.map((t) => `${t.title}: ${en ? "starts at" : "sale a las"} ${t.times.join(", ") || "—"}, ${t.durationMin} min.`).join(" "));
  if (/idioma|language|english|inglés|español|spanish/.test(q)) out.push(en ? "We run the tour in Spanish and English. Tell us which you prefer when you book." : "Hacemos el tour en español e inglés. Dinos cuál prefieres al reservar.");
  out.push(en ? `Thanks for writing! Happy to help. You can see the times and book here, and if anything else comes up just reply to this message. — ${f.companyName}` : `¡Gracias por escribir! Encantados de ayudarte. Puedes ver horarios y reservar en nuestra página, y si te surge otra duda contesta a este mensaje. — ${f.companyName}`);
  return out.slice(0, 3);
}

/** Up to three short reply drafts for the latest traveller message. */
export async function suggestReplies(s: Session, inquiryId: string): Promise<{ drafts: string[]; source: "claude" | "templates" }> {
  const [t] = await threadsWhere(s.company.id, inquiryId, null, s.userId);
  if (!t) throw new RuleError("not_found", "Esa pregunta no existe.");
  const f = await facts(s.company.id), en = t.language === "en";
  const last = [...t.messages].reverse().find((m) => m.fromTraveller)?.body ?? "";
  if (!process.env.ANTHROPIC_API_KEY) return { drafts: templateReplies(last, f, en), source: "templates" };
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: { type: "object", properties: { drafts: { type: "array", items: { type: "string" } } }, required: ["drafts"], additionalProperties: false } },
      },
      system: `You draft short replies for ${f.companyName}, a walking-tour business, answering a traveller who has not booked yet. `
        + `Write in ${en ? "English" : "Spanish (Spain)"}, warm and concrete, 1 to 3 sentences each, no greeting line and no signature. `
        + "Use only the facts below; if the answer is not in them, say the guide will confirm. Give three different drafts.\n\n"
        + `About: ${f.bio.slice(0, 1200)}\nTours:\n${f.tours.map((x) => `- ${x.title}: ${x.durationMin} min, meets at ${x.meetingPoint ?? "to be confirmed"}, ${price(x, en)}, starts ${x.times.join(", ") || "on request"}`).join("\n")}`,
      messages: t.messages.map((m) => ({ role: m.fromTraveller ? "user" as const : "assistant" as const, content: m.body }))
        .filter((m, i, all) => !(i === all.length - 1 && m.role === "assistant")), // must end on the traveller's turn
    });
    if (res.stop_reason === "refusal") return { drafts: templateReplies(last, f, en), source: "templates" };
    const text = res.content.find((b) => b.type === "text");
    const drafts = text && text.type === "text" ? (JSON.parse(text.text) as { drafts: string[] }).drafts.filter((d) => typeof d === "string" && d.trim()).slice(0, 3) : [];
    return drafts.length ? { drafts, source: "claude" } : { drafts: templateReplies(last, f, en), source: "templates" };
  } catch (e) {
    console.error("suggestReplies: falling back to templates", e);
    return { drafts: templateReplies(last, f, en), source: "templates" };
  }
}
