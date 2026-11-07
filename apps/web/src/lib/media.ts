// Photos for the public profile and the tours. Small images (the browser
// resizes them before upload) kept in Postgres and served with long caching;
// ids are random, so URLs are not guessable.
import "server-only";
import { system, withUser } from "./db";
import type { Session } from "./types";
import { RuleError } from "./types";

const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof TYPES)[number];
export const MAX_BYTES = 2_000_000;

/** Check the bytes really are the image type claimed (magic numbers), not just the label. */
export function sniff(b: Uint8Array): ImageType | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export async function addPhoto(s: Session, owner: { kind: "profile" | "tour"; id: string }, bytes: Uint8Array): Promise<string> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede subir fotos.");
  if (bytes.length === 0) throw new RuleError("empty", "Elige una foto.");
  if (bytes.length > MAX_BYTES) throw new RuleError("too_big", "La foto pesa más de 2 MB. Prueba con una más pequeña.");
  const type = sniff(bytes);
  if (!type) throw new RuleError("type", "Sube una foto en JPG, PNG o WebP.");
  return withUser(s.userId, async (tx) => {
    if (owner.kind === "tour") {
      const [t] = await tx`select 1 from tours where id = ${owner.id} and company_id = ${s.company.id}`;
      if (!t) throw new RuleError("not_found", "Ese tour no existe.");
    } else if (owner.id !== s.company.id) throw new RuleError("not_found", "Perfil no válido.");
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from media where owner_kind = ${owner.kind} and owner_id = ${owner.id}`;
    if (n >= 8) throw new RuleError("too_many", "Ya tienes 8 fotos aquí. Borra alguna para subir otra.");
    const [m] = await tx<{ id: string }[]>`insert into media (company_id, owner_kind, owner_id, content_type, bytes, sort)
      values (${s.company.id}, ${owner.kind}, ${owner.id}, ${type}, ${Buffer.from(bytes)}, ${n}) returning id`;
    return m.id;
  });
}

export async function deletePhoto(s: Session, id: string): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede borrar fotos.");
  await withUser(s.userId, (tx) => tx`delete from media where id = ${id} and company_id = ${s.company.id}`);
}

/** Photo ids per owner, in order: the first one is the cover. */
export async function photosFor(ownerIds: string[]): Promise<Map<string, string[]>> {
  if (!ownerIds.length) return new Map();
  const rows = await system((tx) => tx<{ ownerId: string; id: string }[]>`select owner_id, id from media where owner_id = any(${ownerIds}::uuid[]) order by sort, created_at`);
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.ownerId, [...(map.get(r.ownerId) ?? []), r.id]);
  return map;
}

export async function photoBytes(id: string): Promise<{ type: string; bytes: Buffer } | null> {
  // verification documents are private: never served here
  const [m] = await system((tx) => tx<{ contentType: string; bytes: Buffer }[]>`select content_type, bytes from media where id = ${id} and owner_kind in ('profile','tour','review')`);
  return m ? { type: m.contentType, bytes: m.bytes } : null;
}

export const photoUrl = (id: string) => `/api/media/${id}`;
