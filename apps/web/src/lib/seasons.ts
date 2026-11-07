// Seasonal prices (Semana Santa, summer, low season): a percentage applied to
// the tour's price on departures between two dates. A season for one tour
// wins over a season for all tours.
import "server-only";
import { system, withUser, type Tx } from "./db";
import type { Session } from "./types";
import { RuleError } from "./types";

export interface Season { id: string; tourId: string | null; name: string; startsOn: string; endsOn: string; percent: number }

export async function seasonPercent(tx: Tx, companyId: string, tourId: string, date: string): Promise<number> {
  const [s] = await tx<{ percent: number }[]>`select percent from price_seasons where company_id = ${companyId} and ${date}::date between starts_on and ends_on
    and (tour_id = ${tourId} or tour_id is null) order by (tour_id is null), starts_on desc limit 1`;
  return s?.percent ?? 0;
}

export const withSeason = (cents: number, percent: number) => Math.round((cents * (100 + percent)) / 100 / 50) * 50; // rounded to 50 cents

export async function seasons(s: Session): Promise<Season[]> {
  if (s.member.role === "employee") return [];
  return withUser(s.userId, (tx) => tx<Season[]>`select id, tour_id, name, starts_on::text, ends_on::text, percent from price_seasons where company_id = ${s.company.id} order by starts_on`);
}

/** Upcoming seasons that touch a tour, for the public page. */
export async function upcomingSeasons(companyId: string, tourId: string): Promise<Season[]> {
  return system((tx) => tx<Season[]>`select id, tour_id, name, starts_on::text, ends_on::text, percent from price_seasons
    where company_id = ${companyId} and (tour_id = ${tourId} or tour_id is null) and ends_on >= current_date order by starts_on limit 3`);
}

export async function saveSeason(s: Session, x: Omit<Season, "id">): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede cambiar precios.");
  if (!x.name.trim()) throw new RuleError("name", "Ponle nombre a la temporada (por ejemplo, Semana Santa).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(x.endsOn) || x.endsOn < x.startsOn) throw new RuleError("dates", "Revisa las fechas: el final no puede ser antes del inicio.");
  if (!Number.isInteger(x.percent) || x.percent === 0 || x.percent < -90 || x.percent > 300) throw new RuleError("percent", "El cambio va de −90 % a +300 %, y no puede ser 0.");
  await withUser(s.userId, async (tx) => {
    if (x.tourId) { const [t] = await tx`select 1 from tours where id = ${x.tourId} and company_id = ${s.company.id}`; if (!t) throw new RuleError("not_found", "Ese tour no existe."); }
    await tx`insert into price_seasons (company_id, tour_id, name, starts_on, ends_on, percent) values (${s.company.id}, ${x.tourId}, ${x.name.trim().slice(0, 60)}, ${x.startsOn}, ${x.endsOn}, ${x.percent})`;
  });
}

export async function deleteSeason(s: Session, id: string): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede cambiar precios.");
  await withUser(s.userId, (tx) => tx`delete from price_seasons where id = ${id} and company_id = ${s.company.id}`);
}
