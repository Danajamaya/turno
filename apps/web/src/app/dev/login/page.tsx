import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { devSignInAction } from "@/app/actions";
import { listAllMembersForDevLogin } from "@/lib/store";
import { Badge, Button, Card, EmptyState, ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Entrar (desarrollo)" };
export const dynamic = "force-dynamic";

const roleName = { owner: "Dueño", manager: "Gerente", employee: "Empleado" } as const;

// Development-only sign-in: pick any person. Replaced by Supabase Auth (SMS code / email link).
export default async function DevLogin() {
  if (process.env.TURNO_DEV_LOGIN !== "1") notFound();
  const people = await listAllMembersForDevLogin();
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-2 text-xl">Entrar</h1>
      <p className="mb-6 text-sm text-text-muted">Modo de desarrollo: elige con quién entrar. La versión real envía un código por SMS o un enlace por correo.</p>
      <Card>
        {people.length === 0 ? (
          <EmptyState title="Todavía no hay cuentas" body="Crea un negocio primero." action={<ButtonLink href="/signup" variant="primary">Crear cuenta</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="mr-auto">
                  <p className="font-semibold">{p.fullName}</p>
                  <p className="text-xs text-text-muted">{p.companyName}</p>
                </div>
                <Badge tone={p.role === "employee" ? "neutral" : "invited"}>{roleName[p.role]}</Badge>
                <form action={devSignInAction}>
                  <input type="hidden" name="memberId" value={p.id} />
                  <Button size="sm" variant="secondary" aria-label={`Entrar como ${p.fullName}`}>Entrar</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
