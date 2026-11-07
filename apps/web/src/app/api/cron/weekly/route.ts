import { timingSafeEqual } from "node:crypto";
import { sendWeeklySummaries } from "@/lib/summary";

// Called by a scheduler (e.g. a Vercel cron on Mondays at 08:00) with Authorization: Bearer $CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return new Response("Unauthorized", { status: 401 });
  return Response.json({ sent: await sendWeeklySummaries() });
}
