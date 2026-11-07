import Link from "next/link";
import { channelColour } from "@/components/channel";
import { platformName } from "@/lib/guides";

export interface TimelineTour { key: string; start: number; durationMin: number; time: string; tourName: string; people: number; capacity: number | null; byPlatform: [string, number][]; href: string }

// The day at a glance, like a shift row in a schedule: each tour is a block
// from its start to its end, tinted by the platform most of its people came
// from, with a bar showing how full it is. Overlapping tours get their own lane.
export function DayTimeline({ tours, nowHours, label }: { tours: TimelineTour[]; nowHours: number | null; label: string }) {
  const starts = tours.map((t) => t.start), ends = tours.map((t) => t.start + t.durationMin / 60);
  const H0 = Math.min(9, Math.floor(Math.min(...starts, 24))), H1 = Math.max(21, Math.ceil(Math.max(...ends, 0)));
  const span = H1 - H0, pos = (h: number) => ((h - H0) / span) * 100;
  const lanes: number[] = [];
  const placed = [...tours].sort((a, b) => a.start - b.start).map((t) => {
    let lane = lanes.findIndex((end) => end <= t.start);
    if (lane === -1) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = t.start + t.durationMin / 60;
    return { ...t, lane };
  });
  const laneH = 76, height = Math.max(1, lanes.length) * (laneH + 8);
  return (
    <div role="group" aria-label={label}>
      <div className="relative ml-1 mr-1" style={{ height: height + 28 }}>
        {Array.from({ length: span + 1 }, (_, i) => H0 + i).map((h) => (
          <div key={h} className="absolute bottom-0 top-0" style={{ left: `${pos(h)}%` }} aria-hidden>
            <div className="h-full border-l border-dashed border-border" />
            <span className="tnum absolute -bottom-0.5 -translate-x-1/2 text-xs text-text-muted">{h % 2 === 0 ? `${h}:00` : ""}</span>
          </div>
        ))}
        <ul>
          {placed.map((t, i) => {
            const main = t.byPlatform[0]?.[0] ?? "other", c = `var(--color-${channelColour(main)})`;
            const full = t.capacity ? Math.min(1, t.people / t.capacity) : null;
            return (
              <li key={t.key} className="anim-grow-x absolute" style={{ left: `${pos(t.start)}%`, width: `max(${(t.durationMin / 60 / span) * 100}%, 132px)`, top: t.lane * (laneH + 8), height: laneH, animationDelay: `${120 + i * 90}ms` }}>
                <Link href={t.href} className="flex h-full flex-col justify-between overflow-hidden rounded-md border-l-4 px-3 py-2 text-sm shadow-card transition-transform duration-fast hover:-translate-y-0.5"
                  style={{ borderColor: c, background: `color-mix(in srgb, ${c} 14%, var(--color-bg))` }}>
                  <span className="flex items-baseline justify-between gap-2"><b className="tnum">{t.time}</b><span className="tnum font-semibold">{t.people}{t.capacity ? <span className="font-normal text-text-muted">/{t.capacity}</span> : null}</span></span>
                  <span className="truncate font-semibold">{t.tourName}</span>
                  <span className="flex h-1.5 gap-0.5 overflow-hidden rounded-pill bg-bg" role="img" aria-label={t.byPlatform.map(([k, v]) => `${platformName[k] ?? k} ${v}`).join(", ") + (full !== null ? `, ${Math.round(full * 100)} %` : "")}>
                    {t.byPlatform.map(([k, v]) => <span key={k} style={{ flex: v, background: `var(--color-${channelColour(k)})` }} />)}
                    {t.capacity && t.capacity > t.people ? <span style={{ flex: t.capacity - t.people }} /> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {nowHours !== null && nowHours > H0 && nowHours < H1 && (
          <div className="pointer-events-none absolute bottom-5 top-0 z-[1]" style={{ left: `${pos(nowHours)}%` }} role="img" aria-label="Ahora">
            <div className="h-full border-l-2 border-danger" />
            <span className="anim-pulse absolute -left-[5px] -top-1 h-2.5 w-2.5 rounded-pill bg-danger" />
          </div>
        )}
      </div>
    </div>
  );
}
