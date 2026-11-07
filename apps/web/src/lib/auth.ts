// Passwordless sign-in: a one-time link by email (SMS codes plug into the same
// auth_tokens table), then an opaque session token in an httpOnly cookie.
// Only hashes of tokens are stored.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { system } from "./db";
import { appUrl, sendEmail } from "./email";
import { RuleError } from "./types";

const LINK_TTL_MIN = 15;
const SESSION_DAYS = 30;
const MAX_LINKS_PER_HOUR = 5;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const token = () => randomBytes(32).toString("base64url");

/**
 * Emails a sign-in link if the address belongs to someone. Says nothing
 * either way to the caller, so the form cannot be used to find out who has
 * an account.
 */
export async function requestSignInLink(email: string): Promise<void> {
  const t = token();
  const user = await system(async (tx) => {
    const [u] = await tx<{ id: string; fullName: string }[]>`select id, full_name from users where lower(email) = lower(${email})`;
    if (!u) return null;
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from auth_tokens where user_id = ${u.id} and created_at > now() - interval '1 hour'`;
    if (n >= MAX_LINKS_PER_HOUR) return null;
    await tx`insert into auth_tokens (user_id, token_hash, channel, expires_at)
             values (${u.id}, ${hash(t)}, 'email', now() + ${LINK_TTL_MIN + " minutes"}::interval)`;
    return u;
  });
  if (!user) return;
  await sendEmail({
    to: email,
    subject: "Tu enlace para entrar a Turno",
    text: `Hola ${user.fullName.split(" ")[0] || ""},\n\nEntra a Turno con este enlace. Sirve una sola vez y vence en ${LINK_TTL_MIN} minutos:\n\n${appUrl()}/auth/callback?token=${t}\n\nSi no lo pediste, ignora este correo.`,
  });
}

/** Trades a one-time link token for a new session token. */
export async function consumeSignInToken(raw: string): Promise<string> {
  const session = token();
  await system(async (tx) => {
    const [row] = await tx<{ id: string; userId: string }[]>`
      update auth_tokens set used_at = now()
      where token_hash = ${hash(raw)} and used_at is null and expires_at > now()
      returning id, user_id`;
    if (!row) throw new RuleError("invalid_link", "Este enlace ya se usó o venció. Pide uno nuevo.");
    await tx`insert into sessions (user_id, token_hash, expires_at)
             values (${row.userId}, ${hash(session)}, now() + ${SESSION_DAYS + " days"}::interval)`;
    // first sign-in accepts every pending invite for this person
    await tx`update members set status = 'active' where user_id = ${row.userId} and status = 'invited'`;
  });
  return session;
}

/** Starts a session for a user directly (sign-up, development sign-in). */
export async function createSession(userId: string): Promise<string> {
  const session = token();
  await system((tx) => tx`insert into sessions (user_id, token_hash, expires_at)
    values (${userId}, ${hash(session)}, now() + ${SESSION_DAYS + " days"}::interval)`);
  return session;
}

export async function userIdForSession(raw: string): Promise<string | null> {
  return system(async (tx) => {
    const [row] = await tx<{ userId: string }[]>`
      update sessions set last_seen_at = now()
      where token_hash = ${hash(raw)} and expires_at > now()
      returning user_id`;
    return row?.userId ?? null;
  });
}

export async function endSession(raw: string): Promise<void> {
  await system((tx) => tx`delete from sessions where token_hash = ${hash(raw)}`);
}

export async function endAllSessions(userId: string): Promise<void> {
  await system((tx) => tx`delete from sessions where user_id = ${userId}`);
}

/**
 * Deletes the person and everything that is only theirs. Time cards stay with
 * the business (payroll records), detached from the login. An owner has to
 * close the business first so a team is never left without one.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await system(async (tx) => {
    const [owner] = await tx`select 1 from members where user_id = ${userId} and role = 'owner' and status <> 'archived'`;
    if (owner) throw new RuleError("owner", "Eres dueño de un negocio. Ciérralo o pásalo a otra persona antes de borrar tu cuenta.");
    await tx`update members set status = 'archived', email = null, phone = null, pin_hash = null where user_id = ${userId}`;
    await tx`delete from users where id = ${userId}`;
  });
}
