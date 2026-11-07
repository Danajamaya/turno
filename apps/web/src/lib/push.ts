// Web push to the installed app (or any browser that allowed notifications).
// Needs VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT); without
// them subscriptions are still stored and sending is a no-op, so nothing breaks.
import "server-only";
import webpush from "web-push";
import { system, withUser } from "./db";
import type { Session } from "./types";

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;
let configured = false;
function ready(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) { webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hola@example.com", pub, priv); configured = true; }
  return true;
}

export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

export async function savePushSubscription(s: Session, sub: PushSub): Promise<void> {
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("invalid subscription");
  await withUser(s.userId, (tx) => tx`
    insert into push_subscriptions (company_id, member_id, endpoint, p256dh, auth)
    values (${s.company.id}, ${s.member.id}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    on conflict (endpoint) do update set member_id = excluded.member_id, company_id = excluded.company_id, p256dh = excluded.p256dh, auth = excluded.auth`);
}

export async function deletePushSubscription(s: Session, endpoint: string): Promise<void> {
  await withUser(s.userId, (tx) => tx`delete from push_subscriptions where endpoint = ${endpoint} and member_id = ${s.member.id}`);
}

export interface PushMessage { title: string; body: string; url: string; at?: Date }

/** Send to the company's managers and/or specific people. Dead subscriptions are removed. Returns how many were sent. */
export async function notifyMembers(companyId: string, to: { managers?: boolean; memberIds?: string[] }, msg: PushMessage): Promise<number> {
  const subs = await system((tx) => tx<{ id: string; endpoint: string; p256dh: string; auth: string }[]>`
    select ps.id, ps.endpoint, ps.p256dh, ps.auth from push_subscriptions ps join members m on m.id = ps.member_id
    where ps.company_id = ${companyId} and m.status <> 'archived'
      and ((${!!to.managers} and m.role in ('owner','manager')) or m.id = any(${to.memberIds ?? []}::uuid[]))`);
  if (!subs.length || !ready()) return 0;
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await system((tx) => tx`delete from push_subscriptions where id = ${s.id}`);
    }
  }));
  return sent;
}
