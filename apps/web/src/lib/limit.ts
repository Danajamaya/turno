// Fixed-window rate limit kept in memory: enough for one server. Move it to
// Postgres or Redis before running more than one instance.
import "server-only";
import { headers } from "next/headers";

const hits = new Map<string, { n: number; until: number }>();

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** True when the key has used up `max` calls in the current window. */
export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.until < now) {
    hits.set(key, { n: 1, until: now + windowMs });
    return false;
  }
  cur.n++;
  return cur.n > max;
}
