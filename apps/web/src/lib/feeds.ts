// Calendar subscription: a private .ics URL per person that Google Calendar,
// Apple Calendar and Outlook poll on their own. Managers get every tour of the
// company; guides get the tours assigned to them. Only the token's hash is stored.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { system } from "./db";
import { appUrl } from "./email";
import { platformName } from "./guides";
import type { Session } from "./types";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hasFeed(s: Session): Promise<boolean> {
  const [row] = await system((tx) => tx`select 1 from calendar_feeds where member_id = ${s.member.id}`);
  return !!row;
}

/** Creates or replaces the person's feed; the old URL stops working. Returns the new URL (shown once). */
export async function regenerateFeed(s: Session): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await system((tx) => tx`insert into calendar_feeds (company_id, member_id, token_hash) values (${s.company.id}, ${s.member.id}, ${hash(token)})
    on conflict (member_id) do update set token_hash = excluded.token_hash, created_at = now(), last_fetched_at = null`);
  return `${appUrl()}/api/calendario/${token}.ics`;
}

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** RFC 5545 lines are folded at 75 octets. */
const fold = (line: string) => { const out: string[] = []; let rest = line; while (Buffer.byteLength(rest) > 75) { let cut = 74; while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--; out.push(rest.slice(0, cut)); rest = " " + rest.slice(cut); } out.push(rest); return out.join("\r\n"); };

/** The calendar for a token, or null when the token is unknown (revoked or wrong). */
export async function icsForToken(token: string): Promise<string | null> {
  return system(async (tx) => {
    const [feed] = await tx<{ id: string; companyId: string; memberId: string; role: string; companyName: string; locationName: string | null }[]>`
      select f.id, f.company_id, f.member_id, m.role, c.name as company_name,
             (select l.name from locations l where l.company_id = f.company_id order by l.created_at limit 1) as location_name
      from calendar_feeds f join members m on m.id = f.member_id join companies c on c.id = f.company_id
      where f.token_hash = ${hash(token)} and m.status = 'active'`;
    if (!feed) return null;
    await tx`update calendar_feeds set last_fetched_at = now() where id = ${feed.id}`;
    const rows = await tx<{ startsAt: string; tourName: string | null; people: number; platform: string; guideName: string | null }[]>`
      select b.starts_at, b.tour_name, b.people, b.platform, g.full_name as guide_name
      from bookings b left join members g on g.id = b.guide_member_id
      where b.company_id = ${feed.companyId} and b.status <> 'cancelled'
        and b.starts_at > now() - interval '30 days' and b.starts_at < now() + interval '120 days'
        ${feed.role === "employee" ? tx`and b.guide_member_id = ${feed.memberId}` : tx``}
      order by b.starts_at`;
    const groups = new Map<string, { start: Date; tour: string; people: number; platforms: Map<string, number>; guide: string | null }>();
    for (const r of rows) {
      const key = `${r.startsAt}|${r.tourName ?? ""}`;
      const g = groups.get(key) ?? { start: new Date(r.startsAt), tour: r.tourName ?? "Tour", people: 0, platforms: new Map(), guide: r.guideName };
      g.people += r.people; g.platforms.set(r.platform, (g.platforms.get(r.platform) ?? 0) + r.people);
      groups.set(key, g);
    }
    const now = stamp(new Date());
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Turno//Tours//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      `X-WR-CALNAME:${esc(`Turno · ${feed.companyName}`)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
    for (const [key, g] of groups) {
      const end = new Date(g.start.getTime() + 90 * 60_000);
      const detail = [...g.platforms].map(([p, n]) => `${platformName[p] ?? p}: ${n}`).join(", ") + (g.guide ? `\nGuía: ${g.guide}` : "");
      lines.push("BEGIN:VEVENT", `UID:${hash(feed.companyId + key).slice(0, 32)}@turno`, `DTSTAMP:${now}`, `DTSTART:${stamp(g.start)}`, `DTEND:${stamp(end)}`,
        `SUMMARY:${esc(`${g.tour} · ${g.people} personas`)}`, `DESCRIPTION:${esc(detail)}`,
        ...(feed.locationName ? [`LOCATION:${esc(feed.locationName)}`] : []), "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  });
}
