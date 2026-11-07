// Gift cards: someone buys an amount for a friend, who spends it on any tour
// of that business on Turno. Paid with Stripe Checkout when it is set up; a
// manager can also mark a card as paid (sold in person). The balance is used
// at booking time and the rest is paid at the meeting point as usual.
import "server-only";
import { randomInt } from "node:crypto";
import { system, withUser, type Tx } from "./db";
import { appUrl, sendEmail } from "./email";
import { money } from "./format";
import type { Session } from "./types";
import { RuleError } from "./types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const code = () => `REGALO-${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}-${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")}`;
export const normaliseCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");

export interface GiftRequest { slug: string; amountCents: number; buyerName: string; buyerEmail: string; recipientName: string; recipientEmail: string | null; message: string | null; language: "es" | "en" }

export async function startGift(r: GiftRequest): Promise<{ url: string; code: string }> {
  if (!Number.isInteger(r.amountCents) || r.amountCents < 500 || r.amountCents > 100_000) throw new RuleError("amount", "Elige un importe entre 5 y 1.000.");
  if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV === "production") throw new RuleError("payments_off", "La venta de tarjetas regalo todavía no está activada.");
  const { gift, companyName } = await system(async (tx) => {
    const [p] = await tx<{ companyId: string; companyName: string; currency: string }[]>`
      select gp.company_id, c.name as company_name, c.currency from guide_profiles gp join companies c on c.id = gp.company_id where gp.slug = ${r.slug} and gp.published`;
    if (!p) throw new RuleError("not_found", "Esta página ya no está disponible.");
    const [g] = await tx<{ id: string; code: string; currency: string; companyId: string }[]>`
      insert into gift_cards (company_id, code, amount_cents, balance_cents, currency, buyer_name, buyer_email, recipient_name, recipient_email, message)
      values (${p.companyId}, ${code()}, ${r.amountCents}, ${r.amountCents}, ${p.currency}, ${r.buyerName}, ${r.buyerEmail}, ${r.recipientName}, ${r.recipientEmail}, ${r.message})
      returning id, code, currency, company_id`;
    return { gift: g, companyName: p.companyName };
  });
  const done = `${appUrl()}/g/${r.slug}/regalo?listo=${gift.code}&lang=${r.language}`;
  if (!process.env.STRIPE_SECRET_KEY) {
    await activateGiftCard(gift.id, null); // development: no real payment
    return { url: done, code: gift.code };
  }
  const { stripe } = await import("./billing");
  const cs = await stripe().checkout.sessions.create({
    mode: "payment", customer_email: r.buyerEmail,
    line_items: [{ quantity: 1, price_data: { currency: gift.currency.toLowerCase(), unit_amount: r.amountCents, product_data: { name: `Tarjeta regalo · ${companyName}` } } }],
    success_url: done, cancel_url: `${appUrl()}/g/${r.slug}/regalo?lang=${r.language}`,
    payment_intent_data: await (await import("./money")).routeTo(gift.companyId, 0),
    metadata: { kind: "gift", gift_id: gift.id },
  });
  await system((tx) => tx`update gift_cards set stripe_session_id = ${cs.id} where id = ${gift.id}`);
  return { url: cs.url!, code: gift.code };
}

/** Paid: the card becomes usable and the buyer (and recipient, if given) get the code. Idempotent. */
export async function activateGiftCard(id: string, sessionId: string | null, tx?: Tx): Promise<void> {
  const run = (t: Tx) => t<{ code: string; amountCents: number; currency: string; buyerName: string; buyerEmail: string; recipientName: string; recipientEmail: string | null; message: string | null; slug: string; companyName: string }[]>`
    update gift_cards g set status = 'active', paid_at = now(), stripe_session_id = coalesce(${sessionId}, g.stripe_session_id)
    from guide_profiles gp, companies c
    where g.id = ${id} and g.status = 'pending' and gp.company_id = g.company_id and c.id = g.company_id
    returning g.code, g.amount_cents, g.currency, g.buyer_name, g.buyer_email, g.recipient_name, g.recipient_email, g.message, gp.slug, c.name as company_name`;
  const [g] = tx ? await run(tx) : await system(run);
  if (!g) return;
  const text = (to: string) => `Hola ${to},\n\n${g.buyerName} te regala ${money(g.amountCents, g.currency)} para un tour con ${g.companyName}.${g.message ? `\n\n«${g.message}»` : ""}\n\nTu código: ${g.code}\nElige tour y fecha aquí y escribe el código al reservar: ${appUrl()}/g/${g.slug}\n`;
  await sendEmail({ to: g.buyerEmail, subject: `Tu tarjeta regalo para ${g.recipientName}`, text: `Gracias por tu compra. Esto es lo que recibirá ${g.recipientName}:\n\n` + text(g.recipientName) });
  if (g.recipientEmail) await sendEmail({ to: g.recipientEmail, subject: `${g.buyerName} te regala un tour`, text: text(g.recipientName) });
}

/** At booking time, inside the booking transaction: how much of `grossCents` the card covers. */
export async function redeemGift(tx: Tx, companyId: string, rawCode: string, grossCents: number): Promise<{ giftId: string; giftCents: number }> {
  const [g] = await tx<{ id: string; balanceCents: number }[]>`select id, balance_cents from gift_cards
    where company_id = ${companyId} and code = ${normaliseCode(rawCode)} and status = 'active' for update`;
  if (!g) throw new RuleError("gift", "Ese código regalo no es válido para este guía o ya se usó.");
  const use = Math.min(g.balanceCents, grossCents);
  if (use <= 0) throw new RuleError("gift", "Este tour es a la voluntad: guarda tu código para un tour con precio.");
  await tx`update gift_cards set balance_cents = balance_cents - ${use}, status = case when balance_cents - ${use} = 0 then 'used' else status end where id = ${g.id}`;
  return { giftId: g.id, giftCents: use };
}

export interface GiftRow { id: string; code: string; amountCents: number; balanceCents: number; currency: string; buyerName: string; recipientName: string; status: string; createdAt: string }

export async function giftCards(s: Session): Promise<GiftRow[]> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede ver las tarjetas regalo.");
  return withUser(s.userId, (tx) => tx<GiftRow[]>`select id, code, amount_cents, balance_cents, currency, buyer_name, recipient_name, status, created_at
    from gift_cards where company_id = ${s.company.id} order by created_at desc limit 100`);
}

/** Sold in person: a manager marks the card as paid. */
export async function markGiftPaid(s: Session, id: string): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede hacer esto.");
  const [g] = await withUser(s.userId, (tx) => tx`select 1 from gift_cards where id = ${id} and company_id = ${s.company.id} and status = 'pending'`);
  if (!g) throw new RuleError("not_found", "Esa tarjeta ya está activa o no existe.");
  await activateGiftCard(id, null);
}
