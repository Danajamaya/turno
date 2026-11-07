import { localDate, localTime } from "@turno/core";
import { channelColour } from "./channel";
import { platformName, type CalendarBooking } from "@/lib/guides";

// Hour grid like Preply's calendar: one column per day, one block per tour
// (bookings of the same tour and time from several platforms are one block).
interface Block { key: string; start: number; end: number; tour: string; people: number; platforms: string[]; lane: number; lanes: number }

const toHours = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h + m / 60; };

export function WeekGrid({ days, list, tz, today, nowHours, durationH = 1.5 }: { days: string[]; list: CalendarBooking[]; tz: string; today: string; nowHours: number; durationH?: number }) {
  const live = list.filter((b) => b.status !== "cancelled");
  const starts = live.map((b) => toHours(localTime(new Date(b.startsAt), tz)));
  const H0 = Math.min(8, ...starts.map(Math.floor)), H1 = Math.max(21, ...starts.map((h) => Math.ceil(h + durationH)));
  const PX = 52, height = (H1 - H0) * PX;
  const columns = days.map((d) => {
    const groups = new Map<string, Block>();
    for (const b of live.filter((x) => localDate(new Date(x.startsAt), tz) === d)) {
      const start = toHours(localTime(new Date(b.startsAt), tz)), key = `${b.startsAt}|${b.tourName ?? ""}`;
      const g = groups.get(key) ?? { key, start, end: start + durationH, tour: b.tourName ?? "Tour", people: 0, platforms: [], lane: 0, lanes: 1 };
      g.people += b.people;
      if (!g.platforms.includes(b.platform)) g.platforms.push(b.platform);
      groups.set(key, g);
    }
    const blocks = [...groups.values()].sort((a, b) => a.start - b.start);
    // greedy lanes, then each block takes 1/n of the column where n = lanes in its overlap cluster
    const laneEnds: number[] = [];
    for (const blk of blocks) {
      let lane = laneEnds.findIndex((e) => e <= blk.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = blk.end; blk.lane = lane;
    }
    for (const blk of blocks) blk.lanes = Math.max(...blocks.filter((o) => o.start < blk.end && blk.start < o.end).map((o) => o.lane)) + 1;
    return { d, blocks, people: blocks.reduce((n, b) => n + b.people, 0) };
  });
  const label = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd))); };

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised shadow-card">
      <div className="grid min-w-[880px]" style={{ gridTemplateColumns: `52px repeat(7, minmax(110px, 1fr))` }}>
        <div className="border-b border-border" />
        {columns.map((c) => (
          <div key={c.d} className={`border-b border-l border-border p-2 text-sm font-semibold ${c.d === today ? "text-accent" : ""}`}>
            {label(c.d)}<span className="tnum block text-xs font-normal text-text-muted">{c.people} personas</span>
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {Array.from({ length: H1 - H0 + 1 }, (_, i) => <span key={i} className="tnum absolute right-2 -translate-y-1/2 text-xs text-text-muted" style={{ top: i * PX }}>{H0 + i}:00</span>)}
        </div>
        {columns.map((c) => (
          <div key={c.d} className={`relative border-l border-border ${c.d === today ? "bg-accent-soft" : ""}`} style={{ height, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${PX - 1}px, var(--color-border) ${PX - 1}px ${PX}px)` }}>
            {c.d === today && nowHours > H0 && nowHours < H1 && (
              <div className="absolute inset-x-0 z-[1] border-t-2 border-danger" style={{ top: (nowHours - H0) * PX }} aria-label="Ahora"><span className="absolute -left-1 -top-[6px] h-2.5 w-2.5 rounded-pill bg-danger" /></div>
            )}
            {c.blocks.map((b) => {
              const main = b.platforms[0];
              return (
                <div key={b.key} title={`${b.tour} · ${b.people} personas · ${b.platforms.map((p) => platformName[p]).join(", ")}`}
                  className={`absolute overflow-hidden rounded-md border-l-4 bg-surface p-1.5 text-xs shadow-card border-l-${channelColour(main)}`}
                  style={{ top: (b.start - H0) * PX + 2, height: durationH * PX - 4, left: `calc(${(b.lane / b.lanes) * 100}% + 3px)`, width: `calc(${100 / b.lanes}% - 6px)` }}>
                  <b className="tnum block">{localTimeLabel(b.start)}</b>
                  <span className="block truncate font-semibold">{b.tour}</span>
                  <span className="tnum block text-text-muted">{b.people} p.</span>
                  <span className="mt-1 flex flex-wrap gap-1">{b.platforms.map((p) => <span key={p} aria-label={platformName[p]} className={`h-2 w-2 rounded-sm bg-${channelColour(p)}`} />)}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const localTimeLabel = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
