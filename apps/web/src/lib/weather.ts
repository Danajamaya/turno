// Weather for the guide's city from Open-Meteo (free, no key). Used to warn
// about rain during upcoming tours. Cached for an hour; any network failure
// simply means no forecast is shown.
import "server-only";

export interface HourForecast { time: string; rainChance: number; code: number; tempC: number }
const cache = new Map<string, { at: number; hours: HourForecast[] }>();

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`weather ${res.status}`);
  return res.json();
}

/** Hourly forecast for the next 48 h, times in UTC ISO. Empty when unknown. */
export async function forecast(city: string, fetchJson: (u: string) => Promise<unknown> = getJson): Promise<HourForecast[]> {
  const key = city.trim().toLowerCase();
  if (!key) return [];
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.hours;
  try {
    const geo = (await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=${encodeURIComponent(city)}`)) as { results?: { latitude: number; longitude: number }[] };
    const place = geo.results?.[0];
    if (!place) return [];
    const f = (await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&hourly=precipitation_probability,weather_code,temperature_2m&forecast_days=2&timezone=UTC`)) as
      { hourly?: { time: string[]; precipitation_probability: number[]; weather_code: number[]; temperature_2m: number[] } };
    const h = f.hourly;
    const hours = h ? h.time.map((t, i) => ({ time: `${t}:00Z`, rainChance: h.precipitation_probability[i] ?? 0, code: h.weather_code[i] ?? 0, tempC: h.temperature_2m[i] ?? 0 })) : [];
    cache.set(key, { at: Date.now(), hours });
    return hours;
  } catch {
    return [];
  }
}

export interface RainAlert { startsAt: string; tourName: string; rainChance: number }

/** Tours whose hours have a 60 % or higher chance of rain. Pure. */
export function rainAlerts(hours: HourForecast[], tours: { startsAt: string; tourName: string; durationMin: number }[], threshold = 60): RainAlert[] {
  const out: RainAlert[] = [];
  for (const t of tours) {
    const a = new Date(t.startsAt).getTime(), b = a + t.durationMin * 60_000;
    const during = hours.filter((h) => { const x = new Date(h.time).getTime(); return x >= a - 3600_000 && x < b; });
    const worst = Math.max(0, ...during.map((h) => h.rainChance));
    if (worst >= threshold) out.push({ startsAt: t.startsAt, tourName: t.tourName, rainChance: worst });
  }
  return out;
}

export const weatherIcon = (code: number) => (code >= 95 ? "⛈" : code >= 61 ? "🌧" : code >= 51 ? "🌦" : code >= 45 ? "🌫" : code >= 2 ? "⛅" : "☀️");
