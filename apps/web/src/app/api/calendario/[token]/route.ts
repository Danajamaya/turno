import { icsForToken } from "@/lib/feeds";

// Private calendar feed: /api/calendario/<token>.ics
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  if (!/^[\w-]{20,64}$/.test(token)) return new Response("not found", { status: 404 });
  const ics = await icsForToken(token);
  if (!ics) return new Response("not found", { status: 404 });
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300", "content-disposition": 'inline; filename="turno.ics"' } });
}
