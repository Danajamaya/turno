// Tips by card. The guide shows a QR at the end of the tour; the traveller
// picks an amount and pays with Stripe Checkout. A paid tip is added to the
// tour's tips and split across the bookings like cash tips, so income per
// platform stays right. Money lands in Turno's Stripe account until Stripe
// Connect pays guides directly (see replica/backend.md).
import "server-only";
import { system, withUser, type Tx } from "./db";
import { appUrl } from "./email";
import { parseKey } from "./guide-app";
import { sign, verify } from "./sign";
import type { Session } from "./types";
import { RuleError } from "./types";

interface TipToken { c: string; s: string; t: string; g: string | null }

/** The link behind a tour's QR. Only its guide or a manager can create it. */
export async function tipLink(s: Session, key: string): Promise<string> {
  const { startsAt, tourName } = parseKey(key);
  const [row] = await withUser(s.userId, (tx) => tx<{ guideMemberId: string | null }[]>`
    select guide_member_id from bookings where company_id = ${s.company.id} and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName} and status <> 'cancelled' limit 1`);
  if (!row) throw new RuleError("not_found", "Ese tour no existe.");
  if (s.member.role === "employee" && row.guideMemberId !== s.member.id) throw new RuleError("forbidden", "Ese tour no es tuyo.");
  return `${appUrl()}/propina/${sign({ c: s.company.id, s: startsAt, t: tourName, g: row.guideMemberId ?? (s.member.role === "employee" ? s.member.id : null) } satisfies TipToken)}`;
}

export interface TipPage { companyName: string; guideName: string | null; tourName: string; startsAt: string; currency: string; timezone: string }

export async function tipPage(token: string): Promise<TipPage | null> {
  const p = verify<TipToken>(token);
  if (!p) return null;
  const [row] = await system((tx) => tx<TipPage[]>`
    select c.name as company_name, c.currency, (select full_name from members where id = ${p.g}) as guide_name, ${p.t}::text as tour_name, ${p.s}::text as starts_at,
           (select timezone from locations where company_id = c.id order by created_at limit 1) as timezone
    from companies c where c.id = ${p.c}`);
  return row ?? null;
}

/** Start a tip: returns where to send the traveller (Stripe Checkout, or straight to thanks in development). */
export async function startTip(token: string, amountCents: number): Promise<{ url: string }> {
  const p = verify<TipToken>(token);
  if (!p) throw new RuleError("invalid", "Este enlace no es válido.");
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 100_000) throw new RuleError("amount", "Elige un importe entre 1 y 1.000.");
  if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV === "production") throw new RuleError("payments_off", "Las propinas con tarjeta todavía no están activadas.");
  const page = await tipPage(token);
  if (!page) throw new RuleError("invalid", "Este enlace no es válido.");
  const [tip] = await system((tx) => tx<{ id: string }[]>`
    insert into tips (company_id, tour_name, starts_at, guide_member_id, amount_cents, currency) values (${p.c}, ${p.t}, ${p.s}, ${p.g}, ${amountCents}, ${page.currency}) returning id`);
  const back = `${appUrl()}/propina/${token}`;
  if (!process.env.STRIPE_SECRET_KEY) {
    await markTipPaid(tip.id, null); // development: no real payment
    return { url: `${back}?gracias=1` };
  }
  const { stripe } = await import("./billing");
  const cs = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: page.currency.toLowerCase(), unit_amount: amountCents, product_data: { name: `Propina · ${page.tourName}`, description: page.guideName ?? page.companyName } } }],
    success_url: `${back}?gracias=1`, cancel_url: back,
    payment_intent_data: await (await import("./money")).routeTo(p.c, 0), // tips go whole to the guide's account when connected
    metadata: { kind: "tip", tip_id: tip.id },
  });
  await system((tx) => tx`update tips set stripe_session_id = ${cs.id} where id = ${tip.id}`);
  return { url: cs.url! };
}

/** A tip was paid (webhook, or development). Idempotent. */
export async function markTipPaid(tipId: string, sessionId: string | null, tx?: Tx): Promise<void> {
  const run = async (t: Tx) => {
    const [tip] = await t<{ companyId: string; startsAt: string; tourName: string; amountCents: number }[]>`
      update tips set status = 'paid', paid_at = now(), stripe_session_id = coalesce(${sessionId}, stripe_session_id)
      where id = ${tipId} and status <> 'paid' returning company_id, starts_at, tour_name, amount_cents`;
    if (!tip) return;
    const [{ total }] = await t<{ total: number }[]>`select coalesce(sum(tips_cents), 0)::int as total from bookings
      where company_id = ${tip.companyId} and starts_at = ${tip.startsAt} and coalesce(tour_name, '') = ${tip.tourName} and status <> 'cancelled'`;
    await splitTips(t, tip.companyId, tip.startsAt, tip.tourName, total + tip.amountCents);
  };
  if (tx) await run(tx); else await system(run);
}

/** Card tips already paid for a tour. */
export async function cardTipsCents(companyId: string, startsAt: string, tourName: string, tx?: Tx): Promise<number> {
  const q = (t: Tx) => t<{ n: number }[]>`select coalesce(sum(amount_cents), 0)::int as n from tips
    where company_id = ${companyId} and starts_at = ${startsAt} and tour_name = ${tourName} and status = 'paid'`;
  const [{ n }] = tx ? await q(tx) : await system(q);
  return n;
}

/** Spread a tour's tips over its bookings by people: those who came, or everyone booked if nobody was checked in yet. */
export async function splitTips(tx: Tx, companyId: string, startsAt: string, tourName: string, totalCents: number): Promise<void> {
  let rows = await tx<{ id: string; people: number }[]>`select id, people from bookings where company_id = ${companyId}
    and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName} and status = 'attended' order by created_at`;
  if (!rows.length) rows = await tx<{ id: string; people: number }[]>`select id, people from bookings where company_id = ${companyId}
    and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName} and status = 'confirmed' order by created_at`;
  const people = rows.reduce((n, b) => n + b.people, 0);
  if (!people) return;
  await tx`update bookings set tips_cents = 0 where company_id = ${companyId} and starts_at = ${startsAt} and coalesce(tour_name, '') = ${tourName}`;
  let left = totalCents;
  for (const [i, b] of rows.entries()) {
    const share = i === rows.length - 1 ? left : Math.floor((totalCents * b.people) / people);
    left -= share;
    await tx`update bookings set tips_cents = ${share} where id = ${b.id}`;
  }
}

