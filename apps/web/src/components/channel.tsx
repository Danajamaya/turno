import { platformName } from "@/lib/guides";

/** The colour token of each platform (validated for colour-blind separation). */
export const channelColour = (platform: string) => `ch-${["guruwalk", "freetour", "strawberry", "getyourguide", "viator", "civitatis"].includes(platform) ? platform : "turno"}`;

// A coloured square plus the printed name: colour is never the only signal.
export function ChannelBadge({ platform }: { platform: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-text-muted">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-sm bg-${channelColour(platform)}`} />
      {platformName[platform] ?? platform}
    </span>
  );
}
