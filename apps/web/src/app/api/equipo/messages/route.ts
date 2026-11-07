// Team chat API for the open conversation: poll for new messages, send one.
import { z } from "zod";
import * as chat from "@/lib/chat";
import { getSession } from "@/lib/session";
import { RuleError } from "@/lib/types";

const Send = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  tour: z.object({ type: z.literal("tour"), startsAt: z.string().datetime(), tourName: z.string().max(120), people: z.number().int().min(0).max(1000), platforms: z.array(z.string().max(20)).max(10) }).nullable().default(null),
});

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const url = new URL(req.url);
  const id = z.string().uuid().safeParse(url.searchParams.get("c"));
  const after = z.string().datetime().optional().safeParse(url.searchParams.get("after") ?? undefined);
  if (!id.success || !after.success) return new Response("bad request", { status: 400 });
  const list = await chat.messages(s, id.data, after.data);
  if (list.length) await chat.markRead(s, id.data);
  return Response.json(list);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new Response("unauthorized", { status: 401 });
  const input = Send.safeParse(await req.json().catch(() => null));
  if (!input.success) return new Response("bad request", { status: 400 });
  try {
    return Response.json(await chat.send(s, input.data.channelId, input.data.body, input.data.tour));
  } catch (e) {
    if (e instanceof RuleError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
