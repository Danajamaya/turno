// Money that moves through Turno: the guide's own Stripe account (Connect
// Express) so payments land with them minus Turno's commission, deposits at
// booking, a no-show fee for free tours (card kept on file, charged only if
// the guide marks the booking as no-show), receipts, and the yearly reports
// for the guide's taxes and for DAC7 (EU platform reporting).
// Every Stripe call is guarded: without STRIPE_SECRET_KEY these features are
// simply not offered, and nothing is stored that could never be paid.
import "server-only";
import type Stripe from "stripe";
import { system, withUser, type Tx } from "./db";
import { appUrl } from "./email";
import type { Session } from "./types";
import { RuleError } from "./types";

export const paymentsOn = () => !!process.env.STRIPE_SECRET_KEY;
const stripe = async () => (await import("./billing")).stripe();

// ------------------------------------------------------------- Connect

/** Link to Stripe's onboarding for the business's own account (created on first use). */
export async function connectOnboardingUrl(s: Session): Promise<string> {
  if (s.member.role !== "owner") throw new RuleError("forbidden", "Solo la persona dueña de la cuenta puede conectar los cobros.");
  if (!paymentsOn()) throw new RuleError("payments_off", "Los cobros todavía no están configurados en este servidor.");
  const st = await stripe();
  let id = s.company.stripeAccountId ?? null;
  if (!id) {
    const acct = await st.accounts.create({ type: "express", country: s.company.country === "US" ? "ES" : s.company.country, email: s.member.email ?? undefined,
      business_profile: { name: s.company.name, product_description: "Tours guiados" }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { company_id: s.company.id } });
    id = acct.id;
    await system((tx) => tx`update companies set stripe_account_id = ${id} where id = ${s.company.id} and stripe_account_id is null`);
  }
  const link = await st.accountLinks.create({ account: id, type: "account_onboarding", refresh_url: `${appUrl()}/settings?cobros=reintentar`, return_url: `${appUrl()}/settings?cobros=listo` });
  return link.url;
}

/** Called from the account.updated webhook: payouts can start once Stripe enables charges and payouts. */
export async function markConnectState(tx: Tx, account: Stripe.Account): Promise<void> {
  await tx`update companies set stripe_account_ready = ${!!(account.charges_enabled && account.payouts_enabled)} where stripe_account_id = ${account.id}`;
}

/** Destination-charge fields: the payment lands on the guide's account, Turno keeps `feeCents`. */
export async function routeTo(companyId: string, feeCents: number): Promise<Stripe.Checkout.SessionCreateParams.PaymentIntentData> {
  const [c] = await system((tx) => tx<{ stripeAccountId: string | null; stripeAccountReady: boolean }[]>`select stripe_account_id, stripe_account_ready from companies where id = ${companyId}`);
  if (!c?.stripeAccountId || !c.stripeAccountReady) return {};
  return { transfer_data: { destination: c.stripeAccountId }, ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}) };
}

// ------------------------------------------------------------- deposits and no-show fees

export interface PaymentStep { url: string }

/** After a booking on Turno: ask for the deposit (paid tours) or a card on file (free tours with a no-show fee). */
export async function paymentStepFor(bookingId: string, slug: string, lang: "es" | "en"): Promise<PaymentStep | null> {
  if (!paymentsOn()) return null;
  const [b] = await system((tx) => tx<{ companyId: string; code: string; tourName: string; people: number; grossCents: number; giftCents: number; discountCents: number; commissionCents: number;
    currency: string; depositCents: number; noShowFeeCents: number; email: string | null }[]>`
    select b.company_id, b.external_ref as code, b.tour_name, b.people, b.gross_cents, b.gift_cents, b.discount_cents, b.turno_commission_cents as commission_cents, b.currency,
           b.deposit_cents, b.no_show_fee_cents, t.email
    from bookings b left join travellers t on t.id = b.traveller_id where b.id = ${bookingId}`);
  if (!b) return null;
  const back = `${appUrl()}/g/${slug}/reserva/${b.code}?lang=${lang}`;
  const st = await stripe();
  if (b.depositCents > 0) {
    const cs = await st.checkout.sessions.create({
      mode: "payment", customer_email: b.email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: b.currency.toLowerCase(), unit_amount: b.depositCents, product_data: { name: `${lang === "en" ? "Deposit" : "Señal"} · ${b.tourName}` } } }],
      payment_intent_data: await routeTo(b.companyId, Math.min(b.commissionCents, b.depositCents)),
      success_url: `${back}&pagado=1`, cancel_url: back, metadata: { kind: "deposit", booking_id: bookingId },
      expires_at: Math.floor(Date.now() / 1000) + 2 * 3600,
    });
    await system((tx) => tx`update bookings set stripe_session_id = ${cs.id} where id = ${bookingId}`);
    return { url: cs.url! };
  }
  if (b.noShowFeeCents > 0) {
    const customer = await st.customers.create({ email: b.email ?? undefined, metadata: { booking_id: bookingId } });
    const cs = await st.checkout.sessions.create({
      mode: "setup", customer: customer.id, currency: b.currency.toLowerCase(), success_url: `${back}&tarjeta=1`, cancel_url: back,
      metadata: { kind: "card_on_file", booking_id: bookingId },
    });
    await system((tx) => tx`update bookings set stripe_session_id = ${cs.id}, stripe_customer_id = ${customer.id} where id = ${bookingId}`);
    return { url: cs.url! };
  }
  return null;
}

/** Webhook: the deposit was paid. */
export async function markDepositPaid(tx: Tx, bookingId: string): Promise<void> {
  await tx`update bookings set deposit_paid_at = coalesce(deposit_paid_at, now()) where id = ${bookingId}`;
}

/** Webhook: the traveller saved a card for the no-show fee. */
export async function saveCardOnFile(tx: Tx, bookingId: string, setupIntentId: string): Promise<void> {
  const si = await (await stripe()).setupIntents.retrieve(setupIntentId);
  const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (pm) await tx`update bookings set stripe_payment_method_id = ${pm} where id = ${bookingId}`;
}

/** The guide marked a booking as no-show: charge the fee once, if a card is on file. Returns whether it was charged. */
export async function chargeNoShow(bookingId: string): Promise<boolean> {
  const [b] = await system((tx) => tx<{ companyId: string; fee: number; currency: string; customer: string | null; pm: string | null; charged: string | null; status: string }[]>`
    select company_id, no_show_fee_cents as fee, currency, stripe_customer_id as customer, stripe_payment_method_id as pm, no_show_charged_at as charged, status
    from bookings where id = ${bookingId}`);
  if (!b || b.status !== "no_show" || b.fee <= 0 || !b.customer || !b.pm || b.charged || !paymentsOn()) return false;
  const claimed = await system((tx) => tx`update bookings set no_show_charged_at = now() where id = ${bookingId} and no_show_charged_at is null returning id`);
  if (!claimed.length) return false;
  try {
    const route = await routeTo(b.companyId, 0);
    await (await stripe()).paymentIntents.create({ amount: b.fee, currency: b.currency.toLowerCase(), customer: b.customer, payment_method: b.pm, off_session: true, confirm: true,
      ...(route.transfer_data ? { transfer_data: route.transfer_data } : {}), metadata: { kind: "no_show", booking_id: bookingId } }, { idempotencyKey: `no-show-${bookingId}` });
    return true;
  } catch (e) {
    await system((tx) => tx`update bookings set no_show_charged_at = null where id = ${bookingId}`);
    console.error("no-show charge failed", bookingId, e);
    return false;
  }
}

/** Hourly: bookings whose deposit was not paid within two hours are cancelled, freeing the places. Returns their ids. */
export async function cancelUnpaidDeposits(now = new Date()): Promise<string[]> {
  const rows = await system((tx) => tx<{ id: string }[]>`update bookings set status = 'cancelled'
    where platform = 'turno' and status = 'confirmed' and deposit_cents > 0 and deposit_paid_at is null and created_at < ${new Date(now.getTime() - 2 * 3600_000)}
    returning id`);
  const { afterBookingChange } = await import("./booking-events");
  for (const r of rows) await afterBookingChange(r.id, "cancel");
  return rows.map((r) => r.id);
}

// ------------------------------------------------------------- fiscal data and reports

export interface Fiscal { legalName: string | null; taxId: string | null; fiscalAddress: string | null; googleReviewUrl: string | null }

export async function fiscal(s: Session): Promise<Fiscal> {
  const [f] = await withUser(s.userId, (tx) => tx<Fiscal[]>`select legal_name, tax_id, fiscal_address, google_review_url from companies where id = ${s.company.id}`);
  return f;
}

export async function saveFiscal(s: Session, f: Fiscal): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede cambiar esto.");
  if (f.taxId && !/^[A-Z0-9][A-Z0-9-]{4,19}$/i.test(f.taxId)) throw new RuleError("tax_id", "Ese NIF / CIF no parece válido.");
  if (f.googleReviewUrl && !/^https:\/\/(g\.page|search\.google\.com|www\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl)\//.test(f.googleReviewUrl)) throw new RuleError("google", "Pega el enlace para reseñas que te da Google (empieza por https://g.page/ o https://search.google.com/).");
  await system((tx) => tx`update companies set legal_name = ${f.legalName}, tax_id = ${f.taxId?.toUpperCase() ?? null}, fiscal_address = ${f.fiscalAddress},
    google_review_url = ${f.googleReviewUrl} where id = ${s.company.id}`);
}

export interface QuarterLine { quarter: number; platform: string; bookings: number; people: number; grossCents: number; platformFeeCents: number; turnoCommissionCents: number; tipsCents: number; netCents: number }

/** The guide's year by quarter and platform, for their tax return (e.g. modelo 130 in Spain). */
export async function yearReport(s: Session, year: number): Promise<QuarterLine[]> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede ver esto.");
  const tz = s.location.timezone;
  return withUser(s.userId, (tx) => tx<QuarterLine[]>`
    select extract(quarter from starts_at at time zone ${tz})::int as quarter, platform, count(*)::int as bookings, sum(people)::int as people,
           sum(gross_cents)::int as gross_cents, sum(platform_fee_cents)::int as platform_fee_cents, sum(turno_commission_cents)::int as turno_commission_cents,
           sum(tips_cents)::int as tips_cents, sum(gross_cents - platform_fee_cents - turno_commission_cents + tips_cents)::int as net_cents
    from bookings where company_id = ${s.company.id} and status <> 'cancelled' and extract(year from starts_at at time zone ${tz}) = ${year}
    group by 1, 2 order by 1, 2`);
}

export interface Dac7Line { companyId: string; companyName: string; legalName: string | null; taxId: string | null; fiscalAddress: string | null; country: string; q1: number; q2: number; q3: number; q4: number; totalCents: number; feesCents: number; activities: number }

/** Platform admins: what each business earned through Turno in a year, by quarter, as DAC7 asks. */
export async function dac7(userId: string, year: number): Promise<Dac7Line[]> {
  const { isPlatformAdmin } = await import("./guides");
  if (!(await isPlatformAdmin(userId))) throw new RuleError("forbidden", "Solo el equipo de Turno puede ver esto.");
  return system((tx) => tx<Dac7Line[]>`
    select c.id as company_id, c.name as company_name, c.legal_name, c.tax_id, c.fiscal_address, c.country,
      coalesce(sum(b.gross_cents) filter (where extract(quarter from b.starts_at) = 1), 0)::int as q1,
      coalesce(sum(b.gross_cents) filter (where extract(quarter from b.starts_at) = 2), 0)::int as q2,
      coalesce(sum(b.gross_cents) filter (where extract(quarter from b.starts_at) = 3), 0)::int as q3,
      coalesce(sum(b.gross_cents) filter (where extract(quarter from b.starts_at) = 4), 0)::int as q4,
      coalesce(sum(b.gross_cents), 0)::int as total_cents, coalesce(sum(b.turno_commission_cents), 0)::int as fees_cents, count(b.id)::int as activities
    from companies c join bookings b on b.company_id = c.id and b.platform = 'turno' and b.status <> 'cancelled' and extract(year from b.starts_at) = ${year}
    group by c.id order by total_cents desc`);
}

export const csv = (rows: (string | number | null)[][]) =>
  rows.map((r) => r.map((v) => { const t = v === null ? "" : String(v); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(";")).join("\n");
