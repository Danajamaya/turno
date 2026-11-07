// Training new guides: each tour can carry a script (what to tell at each
// stop) and require that a guide is marked as trained before Turno suggests
// them for it.
import "server-only";
import { withUser } from "./db";
import type { Session } from "./types";
import { RuleError } from "./types";

export async function trainedPairs(s: Session): Promise<{ tourId: string; memberId: string }[]> {
  return withUser(s.userId, (tx) => tx<{ tourId: string; memberId: string }[]>`select tour_id, member_id from tour_training where company_id = ${s.company.id}`);
}

export async function setTrained(s: Session, tourId: string, memberId: string, trained: boolean): Promise<void> {
  if (s.member.role === "employee") throw new RuleError("forbidden", "Solo un gerente puede marcar la formación.");
  await withUser(s.userId, async (tx) => {
    const [ok] = await tx`select 1 from tours t, members m where t.id = ${tourId} and m.id = ${memberId} and t.company_id = ${s.company.id} and m.company_id = ${s.company.id}`;
    if (!ok) throw new RuleError("not_found", "Ese tour o esa persona no son de tu equipo.");
    if (trained) await tx`insert into tour_training (tour_id, member_id, company_id) values (${tourId}, ${memberId}, ${s.company.id}) on conflict do nothing`;
    else await tx`delete from tour_training where tour_id = ${tourId} and member_id = ${memberId}`;
  });
}

/** The script of a tour, for its guide's app. */
export async function tourScript(s: Session, tourName: string): Promise<string | null> {
  const [t] = await withUser(s.userId, (tx) => tx<{ script: string | null }[]>`select script from tours where company_id = ${s.company.id} and title = ${tourName}`);
  return t?.script ?? null;
}
