import type { MetadataRoute } from "next";
import { system } from "@/lib/db";
import { appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

// Public pages for search engines: the search, each city and each published guide.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await system((tx) => tx<{ slug: string; city: string; updatedAt: string }[]>`select slug, city, updated_at from guide_profiles where published`);
  const base = appUrl();
  const cities = [...new Set(rows.map((r) => r.city.trim()).filter(Boolean))];
  return [
    { url: `${base}/guias`, changeFrequency: "daily", priority: 1 },
    ...cities.map((c) => ({ url: `${base}/tours/${encodeURIComponent(c.toLowerCase().replace(/\s+/g, "-"))}`, changeFrequency: "daily" as const, priority: 0.9 })),
    ...rows.map((r) => ({ url: `${base}/g/${r.slug}`, lastModified: new Date(r.updatedAt), changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
