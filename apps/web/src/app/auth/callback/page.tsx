import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { consumeSignInToken } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { RuleError } from "@/lib/types";
import { Button, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Entrar", robots: { index: false } };

async function finish(f: FormData) {
  "use server";
  let raw: string;
  try {
    raw = await consumeSignInToken(String(f.get("token") ?? ""));
  } catch (e) {
    if (e instanceof RuleError) redirect("/login?enlace=vencido");
    throw e;
  }
  await setSessionCookie(raw);
  redirect("/");
}

// The link opens this page and the button spends the token, so mail scanners
// that open links on their own cannot use it up first.
export default async function Callback({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <Card>
        <h1 className="mb-2 text-xl">Ya casi</h1>
        <p className="mb-6 text-text-muted">Toca el botón para entrar a Turno en este dispositivo.</p>
        <form action={finish}>
          <input type="hidden" name="token" value={token} />
          <Button size="lg" className="w-full">Entrar</Button>
        </form>
      </Card>
    </main>
  );
}
