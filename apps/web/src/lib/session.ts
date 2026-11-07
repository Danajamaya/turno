// The signed-in person, from an opaque session cookie (see auth.ts).
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, endSession, userIdForSession } from "./auth";
import { sessionForUser } from "./store";
import type { Role, Session } from "./types";

const COOKIE = "turno_session";

export const getSession = cache(async (): Promise<Session | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const userId = await userIdForSession(raw);
  return userId ? sessionForUser(userId) : null;
});

export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (roles && !roles.includes(s.member.role)) redirect(s.member.role === "employee" ? "/clock" : "/schedule");
  return s;
}

export async function setSessionCookie(raw: string) {
  (await cookies()).set(COOKIE, raw, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
  });
}

export async function startSession(userId: string) {
  await setSessionCookie(await createSession(userId));
}

export async function signOut() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) await endSession(raw);
  jar.delete(COOKIE);
}

export const isManager = (s: Session) => s.member.role !== "employee";
