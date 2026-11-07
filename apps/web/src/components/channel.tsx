import { platformName } from "@/lib/guides";

// One colour per platform, from the role palette (contrast-checked tokens).
const colour: Record<string, number> = { viator: 1, guruwalk: 2, freetour: 3, civitatis: 4, strawberry: 5, getyourguide: 6, other: 7, turno: 8 };

export function ChannelBadge({ platform }: { platform: string }) {
  const n = colour[platform] ?? 7;
  return <span className={`inline-flex h-5 items-center rounded-pill px-2 text-xs font-semibold bg-role-${n} text-role-${n}-text`}>{platformName[platform] ?? platform}</span>;
}
