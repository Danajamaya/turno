import { deletePushSubscription, savePushSubscription } from "@/lib/push";
import { getSession } from "@/lib/session";

// The signed-in person's browser push subscription.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Unauthorized", { status: 401 });
  try { await savePushSubscription(s, await req.json()); } catch { return new Response("Bad subscription", { status: 400 }); }
  return new Response(null, { status: 204 });
}

export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return new Response("Unauthorized", { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await deletePushSubscription(s, endpoint);
  return new Response(null, { status: 204 });
}
