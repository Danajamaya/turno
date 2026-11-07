// Small signed tokens for public links that must not be guessable or editable
// (e.g. the tip QR of a tour). HMAC-SHA256 over a JSON payload, base64url.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Whether public links can be signed here (always in development; in production only with LINK_SECRET). */
export const canSign = () => !!process.env.LINK_SECRET || process.env.NODE_ENV !== "production";

function secret(): string {
  const s = process.env.LINK_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("Set LINK_SECRET to sign public links.");
  return "dev-only-link-secret";
}

export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function verify<T>(token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()) as T; } catch { return null; }
}
