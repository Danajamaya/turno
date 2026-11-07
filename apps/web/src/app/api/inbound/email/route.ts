// Inbound booking emails, posted by the mail provider (Cloudflare Email
// Routing worker, Postmark or Resend inbound) as JSON with a shared secret.
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ingestEmail } from "@/lib/guides";

const Body = z.object({
  to: z.string().max(320),
  from: z.string().max(320),
  subject: z.string().max(998).default(""),
  text: z.string().max(200_000),
  messageId: z.string().min(1).max(998),
  // provider's verdict on SPF/DKIM for the sender's domain
  authenticated: z.boolean(),
});

function secretOk(given: string | null): boolean {
  const want = process.env.INBOUND_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-inbound-secret"))) return new Response("unauthorized", { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const result = await ingestEmail(parsed.data);
  // 200 even for unknown addresses so the provider does not retry forever.
  return Response.json(result);
}
