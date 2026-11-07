import type { Metadata } from "next";
import Link from "next/link";
import { Banner, Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ enlace?: string; borrada?: string }> }) {
  const q = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <p className="mb-2 text-sm font-semibold text-accent">Turno</p>
      <h1 className="mb-2 text-xl">Entrar</h1>
      <p className="mb-6 text-text-muted">Te mandamos un enlace a tu correo. Sin contraseñas.</p>
      <div className="mb-4 grid gap-3">
        {q.enlace === "vencido" && <Banner tone="warning" role="alert">Ese enlace ya se usó o venció. Pide uno nuevo.</Banner>}
        {q.borrada && <Banner tone="info" role="status">Tu cuenta se borró.</Banner>}
      </div>
      <Card><LoginForm /></Card>
      <p className="mt-6 text-sm text-text-muted">¿Tu negocio todavía no usa Turno? <Link className="text-accent underline" href="/signup">Crea una cuenta</Link></p>
      {process.env.TURNO_DEV_LOGIN === "1" && <p className="mt-2 text-xs text-text-muted"><Link className="underline" href="/dev/login">Entrar en modo desarrollo</Link></p>}
    </main>
  );
}
