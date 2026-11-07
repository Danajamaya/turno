// Stripe Checkout + Customer Portal + webhooks. Subscription state lives in
// our database and is only changed by verified webhook events.
import "server-only";
import Stripe from "stripe";
import { system } from "./db";
import { appUrl } from "./email";
import type { Session, Subscription } from "./types";
import { RuleError } from "./types";

export type PaidPlan = "essentials" | "plus";

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new RuleError("billing_off", "Los cobros todavía no están configurados.");
  return (client ??= new Stripe(key));
}

const priceFor = (plan: PaidPlan) => {
  const id = plan === "plus" ? process.env.STRIPE_PRICE_PLUS : process.env.STRIPE_PRICE_ESSENTIALS;
  if (!id) throw new RuleError("billing_off", "Los cobros todavía no están configurados.");
  return id;
};

const planForPrice = (priceId: string | undefined): Subscription["plan"] =>
  priceId === process.env.STRIPE_PRICE_PLUS ? "plus" : priceId === process.env.STRIPE_PRICE_ESSENTIALS ? "essentials" : "free";

async function customerFor(s: Session): Promise<string> {
  if (s.company.stripeCustomerId) return s.company.stripeCustomerId;
  const c = await stripe().customers.create({ name: s.company.name, email: s.member.email ?? undefined, metadata: { company_id: s.company.id } });
  await system((tx) => tx`update companies set stripe_customer_id = ${c.id} where id = ${s.company.id} and stripe_customer_id is null`);
  return c.id;
}

/** Checkout page URL for a plan, priced per location. */
export async function checkoutUrl(s: Session, plan: PaidPlan): Promise<string> {
  const [{ n }] = await system((tx) => tx<{ n: number }[]>`select count(*)::int as n from locations where company_id = ${s.company.id} and archived_at is null`);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await customerFor(s),
    line_items: [{ price: priceFor(plan), quantity: Math.max(1, n) }],
    client_reference_id: s.company.id,
    subscription_data: { metadata: { company_id: s.company.id } },
    success_url: `${appUrl()}/settings?pago=ok`,
    cancel_url: `${appUrl()}/settings`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return session.url;
}

/** Stripe's portal: change plan, update card, cancel in one click. */
export async function portalUrl(s: Session): Promise<string> {
  const p = await stripe().billingPortal.sessions.create({ customer: await customerFor(s), return_url: `${appUrl()}/settings` });
  return p.url;
}

/**
 * Verifies and applies one webhook delivery. Returns false for a duplicate
 * (Stripe retries), which the route still answers with 200.
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new RuleError("bad_signature", "missing signature");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    throw new RuleError("bad_signature", "invalid signature");
  }
  return system(async (tx) => {
    const fresh = await tx`insert into stripe_events (id, type) values (${event.id}, ${event.type}) on conflict do nothing returning id`;
    if (fresh.length === 0) return false;
    switch (event.type) {
      case "checkout.session.completed": {
        const cs = event.data.object as Stripe.Checkout.Session;
        if (cs.client_reference_id && typeof cs.customer === "string") {
          await tx`update companies set stripe_customer_id = ${cs.customer} where id = ${cs.client_reference_id}`;
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const item = sub.items.data[0];
        const deleted = event.type === "customer.subscription.deleted" || sub.status === "canceled";
        const status = deleted ? "canceled" : (["trialing", "active", "past_due", "incomplete"].includes(sub.status) ? sub.status : "past_due");
        const end = item?.current_period_end ? new Date(item.current_period_end * 1000) : null;
        const companyId = sub.metadata?.company_id;
        if (!companyId) break;
        await tx`
          insert into subscriptions (company_id, stripe_subscription_id, plan, status, location_quantity, current_period_end)
          values (${companyId}, ${sub.id}, ${deleted ? "free" : planForPrice(item?.price.id)}, ${status}, ${item?.quantity ?? 1}, ${end})
          on conflict (company_id) do update set
            stripe_subscription_id = excluded.stripe_subscription_id, plan = excluded.plan, status = excluded.status,
            location_quantity = excluded.location_quantity, current_period_end = excluded.current_period_end`;
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        if (typeof inv.customer === "string") {
          await tx`update subscriptions set status = 'past_due'
                   where company_id = (select id from companies where stripe_customer_id = ${inv.customer})`;
        }
        break;
      }
    }
    return true;
  });
}
