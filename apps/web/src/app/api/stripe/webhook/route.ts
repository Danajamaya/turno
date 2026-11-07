import { handleWebhook } from "@/lib/billing";
import { RuleError } from "@/lib/types";

// Stripe calls this; the raw body is needed to verify the signature.
export async function POST(req: Request) {
  const body = await req.text();
  try {
    const applied = await handleWebhook(body, req.headers.get("stripe-signature"));
    return Response.json({ received: true, duplicate: !applied });
  } catch (e) {
    if (e instanceof RuleError) return new Response(e.message, { status: 400 });
    throw e;
  }
}
