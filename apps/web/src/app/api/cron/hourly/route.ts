import { timingSafeEqual } from "node:crypto";
import { cancelUnpaidDeposits } from "@/lib/money";

// Hourly: release places held by bookings whose deposit was never paid. Authorization: Bearer $CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET, got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return new Response("Unauthorized", { status: 401 });
  return Response.json({ cancelled: (await cancelUnpaidDeposits()).length });
}
