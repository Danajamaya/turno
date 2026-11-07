import type { Metadata } from "next";
import GuideSearch from "@/app/guias/page";
import { searchFacets } from "@/lib/marketplace";

export const dynamic = "force-dynamic";
const unslug = (s: string) => decodeURIComponent(s).replace(/-/g, " ");

// One indexable page per city ("free tours Madrid"): the same search, filtered, with its own title.
export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { cities } = await searchFacets();
  const raw = unslug((await params).city);
  const city = cities.find((c) => c.toLowerCase() === raw.toLowerCase()) ?? raw;
  return {
    title: `Free tours y visitas guiadas en ${city}`,
    description: `Tours con guías locales en ${city}: free tours, rutas gastronómicas y visitas privadas. Mira horarios, reseñas verificadas y reserva en un minuto.`,
    alternates: { canonical: `/tours/${encodeURIComponent(city.toLowerCase().replace(/\s+/g, "-"))}` },
  };
}

export default async function CityPage({ params, searchParams }: { params: Promise<{ city: string }>; searchParams: Promise<{ lang?: string }> }) {
  const city = unslug((await params).city);
  const q = await searchParams;
  return GuideSearch({ searchParams: Promise.resolve({ city, lang: q.lang }) });
}
