"use server";
// Server actions for money, sales, operations, platforms and trust (migration 0007).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientIp, limited } from "@/lib/limit";
import { requireSession } from "@/lib/session";
import { RuleError } from "@/lib/types";
import { fieldsOf, LoginInput, uuid } from "@/lib/validate";
import * as money from "@/lib/money";
import * as discounts from "@/lib/discounts";
import type { FormState } from "./actions";

const TOO_MANY = "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
const fail = (e: unknown, fields?: Record<string, string>): FormState => { if (e instanceof RuleError) return { error: e.message, fields }; throw e; };
const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max) || null;
const cents = (f: FormData, k: string) => { const v = Number(String(f.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null; };

// ------------------------------------------------------------- money

export async function connectAction() {
  const s = await requireSession(["owner"]);
  let url: string;
  try { url = await money.connectOnboardingUrl(s); } catch (e) { if (e instanceof RuleError) redirect(`/settings?cobros=${e.code}`); throw e; }
  redirect(url);
}

export async function saveFiscalAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  try { await money.saveFiscal(s, { legalName: text(f, "legalName"), taxId: text(f, "taxId", 20), fiscalAddress: text(f, "fiscalAddress", 300), googleReviewUrl: text(f, "googleReviewUrl", 300) }); }
  catch (e) { return fail(e); }
  revalidatePath("/settings");
  return { ok: "Guardado." };
}

// ------------------------------------------------------------- discount codes and partners

export async function saveDiscountAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const kind = f.get("kind") === "amount" ? "amount" : "percent";
  const value = Number(String(f.get("value") ?? "").replace(",", "."));
  try {
    await discounts.saveDiscountCode(s, { code: String(f.get("code") ?? ""), percent: kind === "percent" ? Math.round(value) : null, amountCents: kind === "amount" ? Math.round(value * 100) : null,
      partnerName: text(f, "partnerName", 80), partnerCommissionBps: Math.round(Number(f.get("partnerCommission") || 0) * 100),
      maxUses: Number(f.get("maxUses")) > 0 ? Math.round(Number(f.get("maxUses"))) : null, expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(String(f.get("expiresOn"))) ? String(f.get("expiresOn")) : null });
  } catch (e) { return fail(e); }
  revalidatePath("/perfil");
  return { ok: "Código creado." };
}

export async function toggleDiscountAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await discounts.setDiscountActive(s, uuid.parse(String(f.get("id"))), f.get("active") === "1");
  revalidatePath("/perfil");
}


// ------------------------------------------------------------- trust

export async function requestVerificationAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner"]);
  const files = f.getAll("doc").filter((x): x is File => x instanceof File && x.size > 0);
  try { await (await import("@/lib/trust")).requestVerification(s, await Promise.all(files.map(async (x) => new Uint8Array(await x.arrayBuffer())))); } catch (e) { return fail(e); }
  revalidatePath("/settings");
  return { ok: "Enviado. Te avisamos por correo en cuanto lo revisemos (normalmente en 2 días)." };
}

export async function decideVerificationAction(f: FormData) {
  const s = await requireSession();
  await (await import("@/lib/trust")).decideVerification(s.userId, uuid.parse(String(f.get("companyId"))), f.get("approve") === "1");
  revalidatePath("/admin");
}

// ------------------------------------------------------------- group quotes

export async function quoteAction(_: FormState, f: FormData): Promise<FormState> {
  const fields = fieldsOf(f, ["slug", "name", "email", "people", "date", "groupKind", "body"]);
  const en = f.get("lang") === "en";
  if (limited(`quote:${await clientIp()}`, 6, 60 * 60_000)) return { error: TOO_MANY, fields };
  const email = LoginInput.safeParse({ email: fields.email });
  const people = Math.round(Number(fields.people));
  if (!fields.name.trim()) return { error: en ? "Write your name." : "Escribe tu nombre.", fields };
  if (!email.success) return { error: en ? "Write a valid email." : "Escribe un correo válido.", fields };
  if (!(people >= 2 && people <= 500)) return { error: en ? "How many people? (2 to 500)" : "¿Cuántas personas? (de 2 a 500)", fields };
  const { ask } = await import("@/lib/inquiries");
  try {
    await ask({ slug: fields.slug, name: fields.name.trim().slice(0, 120), email: email.data.email, language: en ? "en" : "es", kind: "quote",
      details: { people, date: /^\d{4}-\d{2}-\d{2}$/.test(fields.date) ? fields.date : null, groupKind: fields.groupKind.slice(0, 40) },
      body: fields.body.trim() || (en ? `Quote for a group of ${people}.` : `Presupuesto para un grupo de ${people} personas.`) });
  } catch (e) { return fail(e, fields); }
  return { ok: en ? "Sent. We will email you a quote." : "Enviado. Te mandamos el presupuesto por correo." };
}

// ------------------------------------------------------------- the day of the tour

export async function shareLocationAction(key: string, lat: number, lng: number): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  try { await (await import("@/lib/ops")).shareLocation(s, key, lat, lng); return { ok: true }; } catch (e) { if (e instanceof RuleError) return { ok: false, error: e.message }; throw e; }
}

export async function bookingNotesAction(f: FormData) {
  const s = await requireSession();
  await (await import("@/lib/ops")).saveBookingNotes(s, uuid.parse(String(f.get("bookingId"))), String(f.get("notes") ?? ""), Math.max(0, Math.round(Number(f.get("children") || 0))));
  revalidatePath("/clock/tour");
}

export async function requestSwapAction(f: FormData) {
  const s = await requireSession();
  await (await import("@/lib/ops")).requestSwap(s, String(f.get("key")), String(f.get("note") ?? ""));
  revalidatePath("/clock");
  redirect("/clock?cambio=pedido");
}

export async function takeSwapAction(f: FormData) {
  const s = await requireSession();
  try { await (await import("@/lib/ops")).takeSwap(s, uuid.parse(String(f.get("id")))); }
  catch (e) { if (e instanceof RuleError) redirect(`/clock?cambio=${e.code}`); throw e; }
  revalidatePath("/clock");
  redirect("/clock?cambio=hecho");
}

export async function toggleEquipmentAction(f: FormData) {
  const s = await requireSession();
  await (await import("@/lib/ops")).toggleEquipment(s, String(f.get("key")), String(f.get("item")), f.get("checked") === "1");
  revalidatePath("/clock/tour");
}

// ------------------------------------------------------------- platforms: API keys and CSV import

export async function createApiKeyAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  try {
    const key = await (await import("@/lib/octo")).createApiKey(s, String(f.get("platform")), String(f.get("label") ?? ""));
    revalidatePath("/canales");
    return { ok: key };
  } catch (e) { return fail(e); }
}

export async function revokeApiKeyAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await (await import("@/lib/octo")).revokeApiKey(s, uuid.parse(String(f.get("id"))));
  revalidatePath("/canales");
}

export async function importCsvAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elige el archivo CSV." };
  if (file.size > 3_000_000) return { error: "El archivo pesa más de 3 MB. Divídelo en partes." };
  try {
    const r = await (await import("@/lib/importer")).importCsv(s, await file.text(), String(f.get("platform") || "other"));
    revalidatePath("/calendario");
    return { ok: `${r.imported} reservas importadas${r.skipped ? `, ${r.skipped} ya estaban` : ""}${r.errors.length ? `. ${r.errors.length} filas con errores: ${r.errors.slice(0, 3).join("; ")}${r.errors.length > 3 ? "…" : ""}` : "."}` };
  } catch (e) { return fail(e); }
}
