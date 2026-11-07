import { MapPin } from "lucide-react";
import type { Stop } from "@/lib/marketplace";

// The tour's stops in order, each opening in the phone's maps app; a small
// OpenStreetMap view when the stops have coordinates.
export function RouteStops({ stops, label }: { stops: Stop[]; label: string }) {
  const geo = stops.filter((s) => s.lat !== null && s.lng !== null) as { name: string; lat: number; lng: number }[];
  const box = geo.length ? [Math.min(...geo.map((s) => s.lng)) - 0.004, Math.min(...geo.map((s) => s.lat)) - 0.003, Math.max(...geo.map((s) => s.lng)) + 0.004, Math.max(...geo.map((s) => s.lat)) + 0.003] : null;
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer font-semibold">{label} ({stops.length})</summary>
      <ol className="mt-2 grid gap-1.5">
        {stops.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-pill bg-surface text-xs font-bold">{i + 1}</span>
            {s.lat !== null ? <a href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 underline">{s.name}<MapPin aria-hidden size={12} /></a> : <span>{s.name}</span>}
          </li>
        ))}
      </ol>
      {box && <iframe title={label} loading="lazy" className="mt-3 aspect-video w-full rounded-md border border-border" src={`https://www.openstreetmap.org/export/embed.html?bbox=${box.join(",")}&layer=mapnik&marker=${geo[0].lat},${geo[0].lng}`} />}
    </details>
  );
}
