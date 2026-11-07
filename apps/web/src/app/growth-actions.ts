"use server";
// Server actions for the growth features (waitlist, overbooking, tips, photos,
// questions, gift cards, guide pay, weekly summary, push). Same rules as
// actions.ts: parse input, check the session and role, let the data layer scope.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientIp, limited } from "@/lib/limit";
import { requireSession } from "@/lib/session";
import { RuleError } from "@/lib/types";
import { LoginInput, fieldsOf, uuid } from "@/lib/validate";
import * as gifts from "@/lib/gifts";
import * as guidePay from "@/lib/guide-pay";
import * as inquiries from "@/lib/inquiries";
import * as media from "@/lib/media";
import * as tips from "@/lib/tips";
import * as waitlist from "@/lib/waitlist";
import type { FormState } from "./actions";

const TOO_MANY = "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
const fail = (e: unknown, fields?: Record<string, string>): FormState => {
  if (e instanceof RuleError) return { error: e.message, fields };
  throw e;
};
const langOf = (f: FormData): "es" | "en" => (f.get("lang") === "en" ? "en" : "es");

// ------------------------------------------------------------- 1. waitlist

export async function joinWaitlistAction(_: FormState, f: FormData): Promise<FormState> {
  const fields = fieldsOf(f, ["slug", "tourId", "startsAt", "people", "name", "email"]);
  const en = langOf(f) === "en";
  if (limited(`wait:${await clientIp()}`, 10, 60 * 60_000)) return { error: TOO_MANY, fields };
  const email = LoginInput.safeParse({ email: fields.email });
  if (!fields.name.trim()) return { error: en ? "Write your name." : "Escribe tu nombre.", fields };
  if (!email.success) return { error: en ? "Write a valid email so we can tell you." : "Escribe un correo válido para avisarte.", fields };
  try {
    await waitlist.joinWaitlist({ slug: fields.slug, tourId: uuid.parse(fields.tourId), startsAt: fields.startsAt, people: Math.round(Number(fields.people) || 0),
      name: fields.name.trim().slice(0, 120), email: email.data.email, language: langOf(f) });
  } catch (e) { return fail(e, fields); }
  return { ok: en ? "You're on the list. We'll email you if places open up." : "Estás en la lista. Te escribimos si se liberan plazas." };
}

// ------------------------------------------------------------- 2. overbooking

export async function closeDepartureAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await waitlist.setDepartureClosed(s, uuid.parse(String(f.get("tourId"))), String(f.get("startsAt")), f.get("closed") !== "0");
  revalidatePath("/inicio");
}


// ------------------------------------------------------------- 3. tips by card

export async function startTipAction(_: FormState, f: FormData): Promise<FormState> {
  if (limited(`tip:${await clientIp()}`, 20, 60 * 60_000)) return { error: TOO_MANY };
  const raw = String(f.get("other") ?? "").replace(",", ".").trim() || String(f.get("amount") ?? "");
  const cents = Math.round(Number(raw) * 100);
  let url: string;
  try { ({ url } = await tips.startTip(String(f.get("token") ?? ""), cents)); } catch (e) { return fail(e); }
  redirect(url);
}

// ------------------------------------------------------------- 6. gift cards

export async function startGiftAction(_: FormState, f: FormData): Promise<FormState> {
  const fields = fieldsOf(f, ["slug", "amount", "other", "buyerName", "buyerEmail", "recipientName", "recipientEmail", "message"]);
  const en = langOf(f) === "en";
  if (limited(`gift:${await clientIp()}`, 10, 60 * 60_000)) return { error: TOO_MANY, fields };
  const buyer = LoginInput.safeParse({ email: fields.buyerEmail });
  const recipient = fields.recipientEmail.trim() ? LoginInput.safeParse({ email: fields.recipientEmail }) : null;
  if (!fields.buyerName.trim() || !fields.recipientName.trim()) return { error: en ? "Write both names." : "Escribe los dos nombres.", fields };
  if (!buyer.success || (recipient && !recipient.success)) return { error: en ? "Check the email addresses." : "Revisa los correos.", fields };
  const cents = Math.round(Number((fields.other.trim() || fields.amount).replace(",", ".")) * 100);
  let url: string;
  try {
    ({ url } = await gifts.startGift({ slug: fields.slug, amountCents: cents, buyerName: fields.buyerName.trim().slice(0, 120), buyerEmail: buyer.data.email,
      recipientName: fields.recipientName.trim().slice(0, 120), recipientEmail: recipient?.success ? recipient.data.email : null,
      message: fields.message.trim().slice(0, 500) || null, language: langOf(f) }));
  } catch (e) { return fail(e, fields); }
  redirect(url);
}

export async function markGiftPaidAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await gifts.markGiftPaid(s, uuid.parse(String(f.get("id"))));
  revalidatePath("/perfil");
}

// ------------------------------------------------------------- 4. photos

export async function uploadPhotoAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const file = f.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige una foto." };
  const kind = f.get("kind") === "tour" ? "tour" : "profile";
  try { await media.addPhoto(s, { kind, id: kind === "tour" ? uuid.parse(String(f.get("ownerId"))) : s.company.id }, new Uint8Array(await file.arrayBuffer())); } catch (e) { return fail(e); }
  revalidatePath("/perfil");
  return { ok: "Foto subida." };
}

export async function deletePhotoAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await media.deletePhoto(s, uuid.parse(String(f.get("id"))));
  revalidatePath("/perfil");
}

// ------------------------------------------------------------- 5. traveller questions

export async function askAction(_: FormState, f: FormData): Promise<FormState> {
  const fields = fieldsOf(f, ["slug", "name", "email", "body"]);
  const en = langOf(f) === "en";
  if (limited(`ask:${await clientIp()}`, 8, 60 * 60_000)) return { error: TOO_MANY, fields };
  const email = LoginInput.safeParse({ email: fields.email });
  if (!fields.name.trim()) return { error: en ? "Write your name." : "Escribe tu nombre.", fields };
  if (!email.success) return { error: en ? "Write a valid email so the guide can answer." : "Escribe un correo válido para que el guía te conteste.", fields };
  try { await inquiries.ask({ slug: fields.slug, name: fields.name.trim().slice(0, 120), email: email.data.email, body: fields.body, language: langOf(f) }); } catch (e) { return fail(e, fields); }
  return { ok: en ? "Sent. The guide will answer you by email." : "Enviada. El guía te contestará por correo." };
}

export async function replyInquiryAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  try { await inquiries.reply(s, uuid.parse(String(f.get("id"))), String(f.get("body") ?? "")); } catch (e) { return fail(e); }
  revalidatePath("/mensajes");
  return { ok: "Respuesta enviada por correo." };
}

export async function suggestRepliesAction(id: string): Promise<{ drafts: string[]; source: "claude" | "templates" }> {
  const s = await requireSession(["owner", "manager"]);
  return inquiries.suggestReplies(s, uuid.parse(id));
}

export async function travellerReplyAction(_: FormState, f: FormData): Promise<FormState> {
  if (limited(`treply:${await clientIp()}`, 20, 60 * 60_000)) return { error: TOO_MANY };
  const token = String(f.get("token") ?? "");
  try { await inquiries.travellerReply(token, String(f.get("body") ?? "")); } catch (e) { return fail(e); }
  revalidatePath(`/consulta/${token}`);
  return { ok: langOf(f) === "en" ? "Sent." : "Enviado." };
}

// ------------------------------------------------------------- 8. guide assignment and pay

const euros = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "0").replace(",", ".") || 0) * 100);

export async function savePayRuleAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  try {
    await guidePay.savePayRule(s, { memberId: uuid.parse(String(f.get("memberId"))), perTourCents: euros(f.get("perTour")), perPersonCents: euros(f.get("perPerson")),
      tipShareBps: Math.round(Number(f.get("tipShare") ?? 100) * 100), languages: String(f.get("languages") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8) });
  } catch (e) { return fail(e); }
  revalidatePath("/pagos");
  return { ok: "Guardado." };
}

export async function autoAssignAction() {
  const s = await requireSession(["owner", "manager"]);
  const now = new Date();
  const n = await guidePay.applySuggestions(s, now, new Date(now.getTime() + 7 * 86_400_000));
  revalidatePath("/calendario");
  redirect(`/calendario?repartidos=${n}`);
}

// ------------------------------------------------------------- 9. weekly summary

export async function weeklySummaryAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const { system } = await import("@/lib/db");
  await system((tx) => tx`update companies set weekly_summary = ${f.get("on") === "1"} where id = ${s.company.id}`);
  revalidatePath("/settings");
}
