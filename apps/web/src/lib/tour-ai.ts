// "Describe your tour in a sentence": a first draft of the tour (title,
// description, duration, price, stops, what it includes) for the guide to
// edit before saving. Written by Claude when ANTHROPIC_API_KEY is set; without
// it, a draft is built from the sentence itself and prices of similar tours.
import "server-only";
import { system } from "./db";
import type { Session } from "./types";
import { RuleError } from "./types";

export interface TourDraft { title: string; description: string; durationMin: number; priceModel: "free_tip" | "per_person" | "per_group"; priceCents: number; includes: string[]; stops: { name: string; lat: null; lng: null }[]; meetingPoint: string; source: "claude" | "rules"; priceNote: string }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rules-only draft. Pure, apart from the median price passed in. */
export function draftFromText(prompt: string, medianCents: number | null): Omit<TourDraft, "source"> {
  const p = prompt.trim(), low = p.toLowerCase();
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h\b|hora|horas|hour|hours)/.exec(low), m = /(\d+)\s*(?:min|minutos|minutes)/.exec(low);
  const durationMin = h ? Math.round(Number(h[1].replace(",", ".")) * 60) : m ? Number(m[1]) : 120;
  const free = /gratis|free\b|voluntad|propina|tip-based|pay what/.test(low);
  const euros = /(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros)/.exec(low);
  const group = /privad|private|grupo cerrado|per group|por grupo/.test(low);
  const priceCents = free ? 0 : euros ? Math.round(Number(euros[1].replace(",", ".")) * 100) : medianCents ?? 2500;
  const includes = [["tapa", "Tapas"], ["vino", "Vino"], ["wine", "Wine"], ["entrada", "Entradas"], ["ticket", "Tickets"], ["museo", "Entrada al museo"], ["churro", "Chocolate con churros"], ["transporte", "Transporte"], ["bici", "Bicicleta"]]
    .filter(([k]) => low.includes(k)).map(([, v]) => v);
  // stops: proper names inside a sentence ("el barrio de Triana", "la Plaza de España"), not the first word of one
  const skip = /^(tour|free|visita|ruta|paseo|incluye|precio|duraci[oó]n|euros?|horas?|minutos?|private|privad[oa]|the|a|an|and)$/i;
  const stops = [...p.matchAll(/(?<![.!?]\s*|^)(?<=\s)([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+(?:de\s+(?:la\s+|los\s+|las\s+)?|del\s+|of\s+(?:the\s+)?)?[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)*)/g)]
    .map((x) => x[1].trim()).filter((x) => !skip.test(x)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 8).map((name) => ({ name, lat: null, lng: null }));
  const first = p.split(/[.!?\n]/)[0].replace(/\s+/g, " ").trim();
  const title = cap(first.length > 60 ? `${first.slice(0, 57).replace(/\s+\S*$/, "")}…` : first);
  return {
    title, description: cap(p).slice(0, 1000), durationMin: Math.min(600, Math.max(30, durationMin)), priceModel: free ? "free_tip" : group ? "per_group" : "per_person", priceCents,
    includes, stops, meetingPoint: stops[0]?.name ?? "",
    priceNote: free ? "A la voluntad: los viajeros pagan lo que quieren al final." : euros ? "Precio que indicaste." : medianCents ? "Precio medio de tours parecidos en tu ciudad. Ajústalo si quieres." : "Precio orientativo. Ajústalo a tu mercado.",
  };
}

async function medianPrice(s: Session): Promise<number | null> {
  const [r] = await system((tx) => tx<{ m: number | null }[]>`
    select percentile_cont(0.5) within group (order by t.price_cents)::int as m from tours t join guide_profiles gp on gp.company_id = t.company_id
    where t.published and t.price_model = 'per_person' and gp.published
      and unaccent_lower(gp.city) = unaccent_lower(coalesce((select city from guide_profiles where company_id = ${s.company.id}), ''))`);
  return r?.m ?? null;
}

export async function draftTour(s: Session, prompt: string): Promise<TourDraft> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede crear tours.");
  if (prompt.trim().length < 10) throw new RuleError("short", "Cuéntalo en una o dos frases: qué se ve, cuánto dura y qué incluye.");
  const median = await medianPrice(s);
  const base = draftFromText(prompt, median);
  if (!process.env.ANTHROPIC_API_KEY) return { ...base, source: "rules" };
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const res = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5", max_tokens: 4000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: {
        type: "object", additionalProperties: false, required: ["title", "description", "durationMin", "priceModel", "priceEuros", "includes", "stops", "meetingPoint"],
        properties: { title: { type: "string" }, description: { type: "string" }, durationMin: { type: "integer" }, priceModel: { type: "string", enum: ["free_tip", "per_person", "per_group"] },
          priceEuros: { type: "number" }, includes: { type: "array", items: { type: "string" } }, stops: { type: "array", items: { type: "string" } }, meetingPoint: { type: "string" } } } } },
      system: "You write tour listings for a local walking-tour business in Spain. Write in Spanish (Spain): a title under 60 characters, a warm, concrete description of 2 to 4 sentences, "
        + "realistic stops in order, the meeting point, the duration, and a price. Keep every fact the guide gave; do not invent tickets or food they did not mention. "
        + (median ? `Similar tours in this city cost about ${(median / 100).toFixed(0)} euros per person.` : ""),
      messages: [{ role: "user", content: prompt.slice(0, 2000) }],
    });
    if (res.stop_reason === "refusal") return { ...base, source: "rules" };
    const block = res.content.find((b) => b.type === "text");
    const d = block && block.type === "text" ? JSON.parse(block.text) as { title: string; description: string; durationMin: number; priceModel: TourDraft["priceModel"]; priceEuros: number; includes: string[]; stops: string[]; meetingPoint: string } : null;
    if (!d) return { ...base, source: "rules" };
    return { title: d.title.slice(0, 120), description: d.description.slice(0, 1000), durationMin: Math.min(600, Math.max(30, d.durationMin)), priceModel: d.priceModel,
      priceCents: d.priceModel === "free_tip" ? 0 : Math.round(d.priceEuros * 100), includes: d.includes.slice(0, 10), stops: d.stops.slice(0, 12).map((name) => ({ name, lat: null, lng: null })),
      meetingPoint: d.meetingPoint.slice(0, 200), source: "claude", priceNote: base.priceNote };
  } catch (e) {
    console.error("draftTour: using rules", e);
    return { ...base, source: "rules" };
  }
}
