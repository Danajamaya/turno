import type { Metadata } from "next";
import { Badge, Banner, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { listMembers } from "@/lib/store";
import { AddMemberForm } from "./add-member-form";

export const metadata: Metadata = { title: "Equipo" };
const roleName = { owner: "Dueño", manager: "Gerente", employee: "Empleado" } as const;

// S03 team list + S02 add people.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ nuevo?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const { nuevo } = await searchParams;
  const people = await listMembers(s);
  const staff = people.filter((p) => p.role !== "owner");
  return (
    <>
      <PageHeader title="Equipo">{staff.length > 0 && <ButtonLink href="/schedule" variant="primary">Ir al horario</ButtonLink>}</PageHeader>
      {nuevo && <div className="mb-6"><Banner tone="success" role="status">¡Listo! {s.company.name} ya está creado. Ahora agrega a tu equipo.</Banner></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0">
          {staff.length === 0 ? (
            <EmptyState title="Todavía no hay nadie en tu equipo" body="Agrega a la primera persona con el formulario. Le llegará una invitación." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-text-muted">
                  <tr className="border-b border-border"><th scope="col" className="py-2 pr-4 font-semibold">Nombre</th><th scope="col" className="py-2 pr-4 font-semibold">Puesto</th><th scope="col" className="py-2 pr-4 font-semibold">Sueldo / hora</th><th scope="col" className="hidden py-2 pr-4 font-semibold md:table-cell">Contacto</th><th scope="col" className="py-2 font-semibold">Estado</th></tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-4 font-semibold">{p.fullName}<span className="block text-xs font-normal text-text-muted">{roleName[p.role]}</span></td>
                      <td className="py-3 pr-4">{p.jobTitle ?? "—"}</td>
                      <td className="tnum py-3 pr-4">{p.wageCents ? money(p.wageCents) : "—"}</td>
                      <td className="hidden max-w-[16rem] truncate py-3 pr-4 text-text-muted md:table-cell">{p.phone ?? p.email}</td>
                      <td className="py-3">{p.status === "invited" ? <Badge tone="invited">Invitado</Badge> : <Badge tone="approved">Activo</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 text-lg">Agregar persona</h2>
          <AddMemberForm />
        </Card>
      </div>
    </>
  );
}
