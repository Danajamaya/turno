import type { Metadata } from "next";
import Link from "next/link";
import { signOutEverywhereAction } from "@/app/actions";
import { Button, Card } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { DeleteAccountForm } from "../(manager)/settings/delete-account-form";

export const metadata: Metadata = { title: "Mi cuenta" };

// Account controls for everyone, employees included (app stores require in-app deletion).
export default async function AccountPage() {
  const s = await requireSession();
  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-6">
      <Link href="/" className="text-sm text-accent underline">← Volver</Link>
      <Card>
        <h1 className="mb-1 text-lg">Mi cuenta</h1>
        <p className="mb-4 text-sm text-text-muted">{s.member.fullName} · {s.member.email ?? s.member.phone}</p>
        <form action={signOutEverywhereAction} className="mb-6">
          <Button variant="secondary">Cerrar sesión en todos los dispositivos</Button>
        </form>
        <DeleteAccountForm isOwner={s.member.role === "owner"} />
      </Card>
    </main>
  );
}
