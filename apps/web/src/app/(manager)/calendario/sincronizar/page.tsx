import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSync } from "@/components/calendar-sync";
import { Card, PageHeader } from "@/components/ui";
import { hasFeed } from "@/lib/feeds";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sincronizar calendario" };

export default async function SyncPage() {
  const s = await requireSession(["owner", "manager"]);
  return (
    <>
      <Link href="/calendario" className="text-sm text-accent underline">← Calendario</Link>
      <PageHeader title="Ver tus tours en tu calendario" />
      <Card className="max-w-2xl">
        <p className="mb-4 text-text-muted">Todos los tours de {s.company.name}, de todas las plataformas, en Google Calendar, Apple Calendar u Outlook. Cada guía puede hacer lo mismo desde «Cuenta» y ve solo los suyos.</p>
        <CalendarSync has={await hasFeed(s)} />
      </Card>
    </>
  );
}
