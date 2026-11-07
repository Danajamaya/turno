import { getSession } from "@/lib/session";
import { verificationDocument } from "@/lib/trust";

// Verification documents, for Turno's own reviewers only. Never cached.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  const { id } = await params;
  const doc = s && /^[0-9a-f-]{36}$/.test(id) ? await verificationDocument(s.userId, id) : null;
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.bytes), { headers: { "Content-Type": doc.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
