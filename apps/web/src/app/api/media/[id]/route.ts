import { photoBytes } from "@/lib/media";

// Public images (profile and tour photos). Ids are random; content never changes, so cache for a year.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const m = await photoBytes(id);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(m.bytes), { headers: { "Content-Type": m.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
