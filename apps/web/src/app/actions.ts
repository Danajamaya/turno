"use server";
// Server actions. Each one parses its input with zod, checks the session and
// role itself, and leaves company scoping to the data layer.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { shiftInterval } from "@turno/core";
import { deleteAccount, endAllSessions, requestSignInLink } from "@/lib/auth";
import { checkoutUrl, portalUrl, type PaidPlan } from "@/lib/billing";
import { clientIp, limited } from "@/lib/limit";
import { requireSession, signOut, startSession } from "@/lib/session";
import * as db from "@/lib/store";
import * as guides from "@/lib/guides";
import * as guideApp from "@/lib/guide-app";
import * as feeds from "@/lib/feeds";
import * as marketplace from "@/lib/marketplace";
import * as crm from "@/lib/crm";
import { RuleError } from "@/lib/types";
import { fieldsOf, firstError, localDateSchema, LoginInput, MemberInput, ReviewInput, ShiftInput, SignupInput, uuid } from "@/lib/validate";

export type FormState = { error?: string; ok?: string; fields?: Record<string, string> };

const fail = (e: unknown, fields?: Record<string, string>): FormState => {
  if (e instanceof RuleError) return { error: e.message, fields };
  throw e;
};
const TOO_MANY = "Demasiados intentos. Espera unos minutos y vuelve a intentar.";

export async function signupAction(_: FormState, f: FormData): Promise<FormState> {
  const fields = fieldsOf(f, ["companyName", "industry", "locationName", "timezone", "ownerName", "ownerEmail"]);
  if (limited(`signup:${await clientIp()}`, 5, 60 * 60_000)) return { error: TOO_MANY, fields };
  const input = SignupInput.safeParse(fields);
  if (!input.success) return { error: firstError(input.error), fields };
  let userId: string;
  try {
    ({ userId } = await db.createCompany(input.data));
  } catch (e) { return fail(e, fields); }
  await startSession(userId);
  redirect("/team?nuevo=1");
}

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const fields = fieldsOf(f, ["email"]);
  const input = LoginInput.safeParse(fields);
  if (!input.success) return { error: firstError(input.error), fields };
  if (limited(`login:${await clientIp()}`, 10, 15 * 60_000)) return { error: TOO_MANY, fields };
  await requestSignInLink(input.data.email);
  // Same answer whether or not the address has an account.
  return { ok: `Si ${input.data.email} tiene cuenta, te mandamos un enlace para entrar. Revisa tu correo.` };
}

export async function addMemberAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const fields = fieldsOf(f, ["fullName", "phone", "email", "role", "jobTitle", "wage"]);
  const input = MemberInput.safeParse(fields);
  if (!input.success) return { error: firstError(input.error), fields };
  if (limited(`invite:${s.company.id}`, 50, 24 * 3600_000)) return { error: "Llegaste al límite de invitaciones por hoy.", fields };
  const { wage, ...rest } = input.data;
  try {
    await db.addMember(s, { ...rest, wageCents: wage });
  } catch (e) { return fail(e, fields); }
  revalidatePath("/team");
  return { ok: `${input.data.fullName} se agregó al equipo.` };
}

export async function createShiftAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const fields = fieldsOf(f, ["week", "date", "start", "end", "memberId", "jobTitle", "breakMin", "note"]);
  const input = ShiftInput.safeParse(fields);
  if (!input.success) return { error: firstError(input.error), fields };
  const v = input.data;
  const { startAt, endAt } = shiftInterval(v.date, v.start, v.end, s.location.timezone);
  try {
    await db.createShift(s, v.week, { memberId: v.memberId, jobTitle: v.jobTitle, startAt, endAt, unpaidBreakMin: v.breakMin, note: v.note });
  } catch (e) { return fail(e, fields); }
  revalidatePath("/schedule");
  redirect(`/schedule?semana=${v.week}`);
}

export async function deleteShiftAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const id = uuid.safeParse(f.get("shiftId"));
  if (id.success) await db.deleteShift(s, id.data);
  revalidatePath("/schedule");
}

export async function copyWeekAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const from = localDateSchema.parse(f.get("from")), to = localDateSchema.parse(f.get("to"));
  const n = await db.copyWeek(s, from, to);
  revalidatePath("/schedule");
  redirect(`/schedule?semana=${to}&copiados=${n}`);
}

export async function publishAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const week = localDateSchema.parse(f.get("week"));
  const { notified } = await db.publishWeek(s, week);
  revalidatePath("/schedule");
  redirect(`/schedule?semana=${week}&publicado=${notified}`);
}

export async function clockInAction(): Promise<FormState> {
  const s = await requireSession();
  try { await db.clockIn(s); } catch (e) {
    if (e instanceof RuleError && e.code === "too_early") return { error: `too_early:${e.message}` };
    return fail(e);
  }
  revalidatePath("/clock");
  return { ok: "in" };
}

export async function clockOutAction(): Promise<FormState> {
  const s = await requireSession();
  try { await db.clockOut(s); } catch (e) { return fail(e); }
  revalidatePath("/clock");
  return { ok: "out" };
}

export async function approveAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const ids = f.getAll("cardId").map(String).filter((x) => uuid.safeParse(x).success);
  await db.approveCards(s, ids);
  revalidatePath("/timesheets");
}

export async function checkoutAction(f: FormData) {
  const s = await requireSession(["owner"]);
  const plan: PaidPlan = f.get("plan") === "plus" ? "plus" : "essentials";
  let url: string;
  try { url = await checkoutUrl(s, plan); } catch (e) {
    if (e instanceof RuleError) redirect("/settings?pago=off");
    throw e;
  }
  redirect(url);
}

export async function portalAction() {
  const s = await requireSession(["owner"]);
  let url: string;
  try { url = await portalUrl(s); } catch (e) {
    if (e instanceof RuleError) redirect("/settings?pago=off");
    throw e;
  }
  redirect(url);
}

export async function signOutEverywhereAction() {
  const s = await requireSession();
  await endAllSessions(s.userId);
  await signOut();
  redirect("/login");
}

export async function deleteAccountAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession();
  if (String(f.get("confirm") ?? "").trim().toUpperCase() !== "BORRAR") return { error: "Escribe BORRAR para confirmar." };
  try { await deleteAccount(s.userId); } catch (e) { return fail(e); }
  await signOut();
  redirect("/login?borrada=1");
}

export async function devSignInAction(f: FormData) {
  if (process.env.TURNO_DEV_LOGIN !== "1") redirect("/login");
  const id = uuid.parse(f.get("memberId"));
  await startSession(await db.devUserForMember(id));
  redirect("/");
}

export async function signOutAction() {
  await signOut();
  redirect("/login");
}

// ------------------------------------------------------------- guides

export async function closeBookingAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const id = uuid.parse(f.get("bookingId"));
  const tips = Math.max(0, Math.round(Number(String(f.get("tips") ?? "0").replace(",", ".")) * 100) || 0);
  await guides.closeBooking(s, id, { attended: f.get("attended") !== "no", tipsCents: Math.min(tips, 10_000_00) });
  revalidatePath("/calendario");
  revalidatePath("/ingresos");
}

export async function setFeeAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const platform = String(f.get("platform"));
  if (!(guides.PLATFORMS as readonly string[]).includes(platform)) return;
  const fee = Math.max(0, Math.round(Number(String(f.get("fee") ?? "0").replace(",", ".")) * 100) || 0);
  await guides.setChannelFee(s, platform, Math.min(fee, 100_00));
  revalidatePath("/canales");
}

export async function resolveReviewAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const id = uuid.parse(f.get("emailId"));
  if (f.get("ignore")) {
    await guides.resolveReview(s, id, "ignore");
    revalidatePath("/canales");
    // the reviewed card disappears, so the confirmation lives on the page
    redirect("/canales?revisado=descartado");
  }
  const v = ReviewInput.safeParse(fieldsOf(f, ["platform", "kind", "externalRef", "date", "time", "people", "tourName", "travellerName"]));
  if (!v.success) return { error: firstError(v.error) };
  try { await guides.resolveReview(s, id, v.data); } catch (e) { return fail(e); }
  revalidatePath("/canales");
  revalidatePath("/calendario");
  redirect("/canales?revisado=agregada");
}

// ------------------------------------------------------------- guide app

export async function assignGuideAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const member = String(f.get("memberId") ?? "");
  await guideApp.assignGuide(s, String(f.get("key") ?? ""), member ? uuid.parse(member) : null);
  revalidatePath("/calendario");
}

export async function checkInAction(f: FormData) {
  const s = await requireSession();
  await guideApp.checkIn(s, uuid.parse(f.get("bookingId")), f.get("present") === "1");
  revalidatePath("/clock/tour");
}

export async function closeTourAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession();
  const tips = Math.round(Number(String(f.get("tips") ?? "0").replace(",", ".")) * 100);
  if (!Number.isFinite(tips) || tips < 0) return { error: "Revisa el importe de las propinas." };
  try { await guideApp.closeTour(s, String(f.get("key") ?? ""), tips); } catch (e) { return fail(e); }
  revalidatePath("/clock/tour");
  return { ok: "Tour cerrado. ¡Buen trabajo!" };
}

export async function calendarFeedAction(): Promise<FormState> {
  const s = await requireSession();
  return { ok: await feeds.regenerateFeed(s) };
}

// ------------------------------------------------------------- profile, tours, marketplace

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);

export async function saveProfileAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const str = (k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);
  const video = str("videoUrl", 300);
  if (video && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//.test(video)) return { error: "El video tiene que ser un enlace de YouTube o Vimeo." };
  try {
    await marketplace.saveProfile(s, { slug: str("slug", 41).toLowerCase(), headline: str("headline", 120), bio: str("bio", 2000), city: str("city", 80),
      languages: list(f.get("languages")), specialities: list(f.get("specialities")), videoUrl: video || null, published: f.get("published") === "on" });
  } catch (e) { return fail(e); }
  revalidatePath("/perfil");
  return { ok: "Perfil guardado." };
}

export async function saveTourAction(_: FormState, f: FormData): Promise<FormState> {
  const s = await requireSession(["owner", "manager"]);
  const n = (k: string, d: number) => { const v = Number(String(f.get(k) ?? "").replace(",", ".")); return Number.isFinite(v) ? v : d; };
  const title = String(f.get("title") ?? "").trim().slice(0, 120);
  if (!title) return { error: "Escribe el nombre del tour." };
  const model = String(f.get("priceModel"));
  const slots = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => String(f.get(`slot-${d}`) ?? "").split(",").map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => ({ weekday: d, time: t.padStart(5, "0") })));
  try {
    await marketplace.saveTour(s, {
      id: f.get("id") ? uuid.parse(f.get("id")) : undefined, title,
      description: String(f.get("description") ?? "").trim().slice(0, 1000) || null, meetingPoint: String(f.get("meetingPoint") ?? "").trim().slice(0, 200) || null,
      durationMin: Math.min(1440, Math.max(15, Math.round(n("durationMin", 120)))), capacity: Math.min(500, Math.max(1, Math.round(n("capacity", 20)))),
      priceModel: (["free_tip", "per_person", "per_group"].includes(model) ? model : "free_tip") as "free_tip", priceCents: Math.max(0, Math.round(n("price", 0) * 100)),
      published: f.get("published") === "on", maxPeoplePerBooking: Math.min(500, Math.max(1, Math.round(n("maxPeople", 10)))), weeklySlots: slots,
    });
  } catch (e) { return fail(e); }
  revalidatePath("/perfil");
  redirect("/perfil?guardado=1");
}

export async function deleteTourAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await marketplace.deleteTour(s, uuid.parse(f.get("id")));
  revalidatePath("/perfil");
}

export async function bookAction(_: FormState, f: FormData): Promise<FormState> {
  const fields = fieldsOf(f, ["slug", "tourId", "startsAt", "people", "name", "email", "phone"]);
  if (limited(`book:${await clientIp()}`, 10, 60 * 60_000)) return { error: TOO_MANY, fields };
  const email = LoginInput.safeParse({ email: fields.email });
  if (!fields.name.trim()) return { error: "Escribe tu nombre.", fields };
  if (!email.success) return { error: "Escribe un correo válido para mandarte la confirmación.", fields };
  let code: string;
  try {
    ({ code } = await marketplace.book({ slug: fields.slug, tourId: uuid.parse(fields.tourId), startsAt: fields.startsAt, people: Math.round(Number(fields.people) || 0),
      name: fields.name.trim().slice(0, 120), email: email.data.email, phone: fields.phone.trim().slice(0, 32) || null, language: f.get("lang") === "en" ? "en" : "es" }));
  } catch (e) { return fail(e, fields); }
  redirect(`/g/${fields.slug}/reserva/${code}?lang=${f.get("lang") === "en" ? "en" : "es"}`);
}

// ------------------------------------------------------------- CRM, messages, reviews

export async function submitReviewAction(_: FormState, f: FormData): Promise<FormState> {
  if (limited(`review:${await clientIp()}`, 20, 60 * 60_000)) return { error: TOO_MANY };
  const token = String(f.get("token") ?? "");
  try { await crm.submitReview(token, Number(f.get("rating")), String(f.get("body") ?? ""), String(f.get("author") ?? "")); } catch (e) { return fail(e); }
  redirect(`/resena/${token}?ok=1&lang=${f.get("lang") === "en" ? "en" : "es"}`);
}

export async function whatsappSendAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  const id = uuid.parse(f.get("id")), body = String(f.get("body") ?? "").trim().slice(0, 2000), phone = String(f.get("phone") ?? "");
  await crm.markSent(s, id, "whatsapp", body);
  revalidatePath("/mensajes");
  redirect(crm.whatsappLink(phone, body));
}

export async function emailSendAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await crm.sendByEmail(s, uuid.parse(f.get("id")), String(f.get("body") ?? ""));
  revalidatePath("/mensajes");
  redirect("/mensajes?enviado=1");
}

export async function skipMessageAction(f: FormData) {
  const s = await requireSession(["owner", "manager"]);
  await crm.skip(s, uuid.parse(f.get("id")));
  revalidatePath("/mensajes");
}
