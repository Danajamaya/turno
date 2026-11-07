// Trust: guide verification (identity and guide licence, reviewed by Turno)
// and referrals (a guide invites another; both pay half commission for a month).
import "server-only";
import { system, withUser } from "./db";
import { appUrl, sendEmail } from "./email";
import { isPlatformAdmin } from "./guides";
import { sniff, MAX_BYTES } from "./media";
import type { Session } from "./types";
import { RuleError } from "./types";

const MONTH = 30 * 86_400_000;

/** The owner sends an ID and a guide licence; documents are private (never served on the public media route). */
export async function requestVerification(s: Session, files: Uint8Array[]): Promise<void> {
  if (s.member.role !== "owner") throw new RuleError("forbidden", "Solo la persona dueña de la cuenta puede pedir la verificación.");
  const docs = files.filter((f) => f.length > 0);
  if (docs.length < 2) throw new RuleError("missing", "Sube tu documento de identidad y tu acreditación de guía.");
  for (const d of docs) {
    if (d.length > MAX_BYTES) throw new RuleError("too_big", "Cada archivo puede pesar hasta 2 MB.");
    if (!sniff(d)) throw new RuleError("type", "Sube fotos en JPG, PNG o WebP.");
  }
  await withUser(s.userId, async (tx) => {
    await tx`delete from media where company_id = ${s.company.id} and owner_kind = 'verification'`;
    for (const [i, d] of docs.slice(0, 4).entries()) {
      await tx`insert into media (company_id, owner_kind, owner_id, content_type, bytes, sort) values (${s.company.id}, 'verification', ${s.company.id}, ${sniff(d)!}, ${Buffer.from(d)}, ${i})`;
    }
  });
  await system((tx) => tx`update companies set verification_status = 'pending' where id = ${s.company.id}`);
}

export async function verificationQueue(adminUserId: string) {
  if (!(await isPlatformAdmin(adminUserId))) throw new RuleError("forbidden", "Solo el equipo de Turno puede ver esto.");
  const rows = await system((tx) => tx<{ companyId: string; companyName: string; documentIds: string[] }[]>`
    select c.id as company_id, c.name as company_name, coalesce(array_agg(m.id order by m.sort) filter (where m.id is not null), '{}') as document_ids
    from companies c left join media m on m.company_id = c.id and m.owner_kind = 'verification'
    where c.verification_status = 'pending' group by c.id order by c.name`);
  return rows.map((r) => ({ ...r, documents: r.documentIds.length }));
}

/** Turno approves or rejects; documents are deleted either way (we keep the decision, not the ID). */
export async function decideVerification(adminUserId: string, companyId: string, approve: boolean): Promise<void> {
  if (!(await isPlatformAdmin(adminUserId))) throw new RuleError("forbidden", "Solo el equipo de Turno puede verificar guías.");
  const owner = await system(async (tx) => {
    await tx`update companies set verification_status = ${approve ? "verified" : "rejected"}, verified_at = ${approve ? new Date() : null} where id = ${companyId}`;
    await tx`delete from media where company_id = ${companyId} and owner_kind = 'verification'`;
    const [o] = await tx<{ email: string | null }[]>`select email from members where company_id = ${companyId} and role = 'owner' limit 1`;
    return o;
  });
  if (owner?.email) await sendEmail({ to: owner.email, subject: approve ? "Ya eres guía verificado en Turno" : "No pudimos verificar tus documentos",
    text: approve ? `Tu perfil ya muestra la insignia de guía verificado.\n${appUrl()}/perfil\n` : `Revisa que se lean bien tu documento y tu acreditación y vuelve a enviarlos desde Configuración.\n${appUrl()}/settings\n` });
}

/** Admin-only access to a verification document. */
export async function verificationDocument(adminUserId: string, id: string) {
  if (!(await isPlatformAdmin(adminUserId))) return null;
  const [m] = await system((tx) => tx<{ contentType: string; bytes: Buffer }[]>`select content_type, bytes from media where id = ${id} and owner_kind = 'verification'`);
  return m ?? null;
}

// ------------------------------------------------------------- referrals

export async function referralInfo(s: Session) {
  const [r] = await withUser(s.userId, (tx) => tx<{ code: string; until: string | null }[]>`select referral_code as code, reduced_commission_until as until from companies where id = ${s.company.id}`);
  const [{ n }] = await system((tx) => tx<{ n: number }[]>`select count(*)::int as n from companies where referred_by = ${s.company.id}`);
  return { code: r.code, link: `${appUrl()}/signup?ref=${r.code}`, invited: n, reducedUntil: r.until && new Date(r.until) > new Date() ? r.until : null };
}

/** At sign-up with a code: the new business gets a month at half commission straight away. */
export async function applyReferral(newCompanyId: string, code: string | null | undefined): Promise<boolean> {
  if (!code) return false;
  return system(async (tx) => {
    const [ref] = await tx<{ id: string }[]>`select id from companies where referral_code = ${code.toUpperCase()} and id <> ${newCompanyId}`;
    if (!ref) return false;
    await tx`update companies set referred_by = ${ref.id}, reduced_commission_until = ${new Date(Date.now() + MONTH)} where id = ${newCompanyId} and referred_by is null`;
    return true;
  });
}

/** When the invited business publishes its page (real activity, not just a sign-up), the one who invited gets their month too. */
export async function rewardReferrer(companyId: string): Promise<void> {
  await system((tx) => tx`update companies r set reduced_commission_until = greatest(coalesce(r.reduced_commission_until, now()), now()) + interval '30 days'
    from companies c where c.id = ${companyId} and c.referred_by = r.id and not exists (select 1 from guide_profiles gp where gp.company_id = c.id and gp.published)`);
}
