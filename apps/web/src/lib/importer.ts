// Bring in past bookings from a spreadsheet (exported from a platform or kept
// by hand), so history, income and the travellers list start complete.
// Idempotent on (platform, reference): importing the same file twice adds nothing.
import "server-only";
import { toInstant } from "@turno/core";
import { system } from "./db";
import { PLATFORMS } from "./guides";
import type { Session } from "./types";
import { RuleError } from "./types";

export const TEMPLATE = "fecha;hora;tour;personas;plataforma;nombre;email;telefono;referencia;importe;estado\n2026-10-04;10:30;Free tour Madrid de los Austrias;4;guruwalk;Laura Gómez;laura@example.com;+34600111222;GW123456;;asistió\n";

/** CSV with ; or , and quoted fields. Pure. */
export function parseCsv(text: string): string[][] {
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) >= (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; continue; }
    if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ALIASES: Record<string, string[]> = {
  date: ["fecha", "date", "dia"], time: ["hora", "time"], tour: ["tour", "actividad", "activity", "producto", "product"], people: ["personas", "people", "pax", "participants"],
  platform: ["plataforma", "platform", "canal", "channel"], name: ["nombre", "name", "cliente", "customer"], email: ["email", "correo", "e-mail"],
  phone: ["telefono", "phone", "movil", "mobile"], ref: ["referencia", "reference", "ref", "codigo", "booking reference", "booking id"], amount: ["importe", "amount", "precio", "price", "total"],
  status: ["estado", "status"],
};

export interface ImportResult { imported: number; skipped: number; errors: string[] }

export async function importCsv(s: Session, text: string, fallbackPlatform = "other"): Promise<ImportResult> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede importar reservas.");
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) throw new RuleError("empty", "El archivo no tiene reservas. Usa la plantilla.");
  if (rows.length > 5001) throw new RuleError("too_big", "Importa como mucho 5.000 reservas por archivo.");
  const head = rows[0].map(norm);
  const col = Object.fromEntries(Object.entries(ALIASES).map(([k, names]) => [k, head.findIndex((h) => names.includes(h))])) as Record<keyof typeof ALIASES, number>;
  if (col.date < 0 || col.time < 0 || col.people < 0) throw new RuleError("columns", "Faltan columnas: necesito al menos fecha, hora y personas.");
  const tz = s.location.timezone, out: ImportResult = { imported: 0, skipped: 0, errors: [] };
  await system(async (tx) => {
    for (const [i, r] of rows.slice(1).entries()) {
      const line = i + 2, get = (k: keyof typeof ALIASES) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
      let date = get("date");
      const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(date);
      if (dmy) date = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
      const time = get("time").padStart(5, "0"), people = Math.round(Number(get("people")));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) { out.errors.push(`Fila ${line}: fecha u hora no válida`); continue; }
      if (!(people >= 1 && people <= 500)) { out.errors.push(`Fila ${line}: personas no válidas`); continue; }
      const platformRaw = norm(get("platform")).replace(/[^a-z]/g, "");
      const platform = (PLATFORMS as readonly string[]).find((p) => platformRaw.startsWith(p.slice(0, 5))) ?? (platformRaw === "turno" ? "turno" : fallbackPlatform);
      const startsAt = toInstant(date, time, tz);
      const ref = (get("ref") || `IMP-${date}-${time}-${norm(get("name")).slice(0, 12)}-${people}`).slice(0, 100);
      const amount = Math.round(Number(get("amount").replace(/[^\d,.-]/g, "").replace(",", ".")) * 100) || 0;
      const st = norm(get("status"));
      const status = /cancel/.test(st) ? "cancelled" : /no.?(show|vino|present)/.test(st) ? "no_show" : /asist|attend|vino|hecho|done/.test(st) || startsAt < new Date() ? "attended" : "confirmed";
      let travellerId: string | null = null;
      const name = get("name"), email = get("email").toLowerCase(), phone = get("phone");
      if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        const [t] = await tx<{ id: string }[]>`insert into travellers (company_id, name, email, phone, first_platform) values (${s.company.id}, ${name}, ${email}, ${phone || null}, ${platform})
          on conflict (company_id, lower(email)) where email is not null do update set phone = coalesce(travellers.phone, excluded.phone) returning id`;
        travellerId = t.id;
      } else if (name || phone) {
        const [found] = phone ? await tx<{ id: string }[]>`select id from travellers where company_id = ${s.company.id} and phone = ${phone}` : [];
        travellerId = found?.id ?? (await tx<{ id: string }[]>`insert into travellers (company_id, name, phone, first_platform) values (${s.company.id}, ${name}, ${phone || null}, ${platform}) returning id`)[0].id;
      }
      const ins = await tx`insert into bookings (company_id, platform, external_ref, tour_name, traveller_id, starts_at, people, status, gross_cents, currency)
        values (${s.company.id}, ${platform}, ${ref}, ${get("tour") || null}, ${travellerId}, ${startsAt}, ${people}, ${status}, ${Math.max(0, amount)}, ${s.company.currency})
        on conflict (company_id, platform, external_ref) do nothing returning id`;
      if (ins.length) out.imported++; else out.skipped++;
    }
  });
  return out;
}
