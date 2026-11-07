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
import { RuleError } from "@/lib/types";
import { fieldsOf, firstError, localDateSchema, LoginInput, MemberInput, ShiftInput, SignupInput, uuid } from "@/lib/validate";

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
