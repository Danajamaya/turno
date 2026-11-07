// Discount codes, including codes given to hotels and other partners who
// send travellers: each use is counted, and the partner's commission is
// worked out from what the traveller paid.
import "server-only";
import { withUser, type Tx } from "./db";
import type { Session } from "./types";
import { RuleError } from "./types";

export interface DiscountCode { id: string; code: string; percent: number | null; amountCents: number | null; partnerName: string | null; partnerCommissionBps: number; maxUses: number | null; uses: number; expiresOn: string | null; active: boolean }

export const normalise = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

/** Inside the booking transaction: validate the code and say how much it takes off `listCents`. */
export async function applyDiscount(tx: Tx, companyId: string, raw: string, listCents: number): Promise<{ id: string; cents: number }> {
  const [d] = await tx<DiscountCode[]>`select * from discount_codes where company_id = ${companyId} and code = ${normalise(raw)} for update`;
  const today = new Date().toISOString().slice(0, 10);
  if (!d || !d.active || (d.expiresOn && String(d.expiresOn).slice(0, 10) < today) || (d.maxUses !== null && d.uses >= d.maxUses)) throw new RuleError("discount", "Ese código de descuento no es válido o ya caducó.");
  if (listCents <= 0) throw new RuleError("discount", "Este tour es a la voluntad: el código sirve para tours con precio.");
  const cents = Math.min(listCents, d.percent ? Math.round((listCents * d.percent) / 100) : d.amountCents!);
  await tx`update discount_codes set uses = uses + 1 where id = ${d.id}`;
  return { id: d.id, cents };
}

export async function discountCodes(s: Session): Promise<(DiscountCode & { bookings: number; paidCents: number; commissionCents: number })[]> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede ver los códigos.");
  return withUser(s.userId, (tx) => tx<(DiscountCode & { bookings: number; paidCents: number; commissionCents: number })[]>`
    select d.*, count(b.id)::int as bookings, coalesce(sum(b.gross_cents), 0)::int as paid_cents,
           coalesce(round(sum(b.gross_cents) * d.partner_commission_bps / 10000.0), 0)::int as commission_cents
    from discount_codes d left join bookings b on b.discount_code_id = d.id and b.status <> 'cancelled'
    where d.company_id = ${s.company.id} group by d.id order by d.created_at desc`);
}

export async function saveDiscountCode(s: Session, c: { code: string; percent: number | null; amountCents: number | null; partnerName: string | null; partnerCommissionBps: number; maxUses: number | null; expiresOn: string | null }): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede crear códigos.");
  const code = normalise(c.code);
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw new RuleError("code", "El código lleva de 3 a 24 letras, números o guiones.");
  if ((c.percent === null) === (c.amountCents === null)) throw new RuleError("kind", "Elige un porcentaje o un importe fijo.");
  if (c.percent !== null && (c.percent < 1 || c.percent > 100)) throw new RuleError("percent", "El porcentaje va de 1 a 100.");
  if (c.partnerCommissionBps < 0 || c.partnerCommissionBps > 5000) throw new RuleError("commission", "La comisión del socio va de 0 a 50 %.");
  try {
    await withUser(s.userId, (tx) => tx`insert into discount_codes (company_id, code, percent, amount_cents, partner_name, partner_commission_bps, max_uses, expires_on)
      values (${s.company.id}, ${code}, ${c.percent}, ${c.amountCents}, ${c.partnerName}, ${c.partnerCommissionBps}, ${c.maxUses}, ${c.expiresOn})`);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new RuleError("taken", "Ya tienes un código con ese nombre.");
    throw e;
  }
}

export async function setDiscountActive(s: Session, id: string, active: boolean): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede cambiar códigos.");
  await withUser(s.userId, (tx) => tx`update discount_codes set active = ${active} where id = ${id} and company_id = ${s.company.id}`);
}
