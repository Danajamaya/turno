import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui";
import { money } from "@/lib/format";
import { bookingByCode } from "@/lib/marketplace";

export const metadata: Metadata = { title: "Reserva confirmada", robots: { index: false } };

export default async function Confirmed({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const b = await bookingByCode(slug, code);
  if (!b) notFound();
  const when = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: b.timezone }).format(new Date(b.startsAt));
  return (
    <main className="mx-auto grid max-w-lg gap-4 px-4 py-12">
      <Card className="text-center">
        <CheckCircle2 aria-hidden className="mx-auto mb-3 text-success" size={48} />
        <h1 className="font-serif text-xl">¡Reserva confirmada!</h1>
        <p className="mt-1 text-text-muted">Te mandamos los detalles por correo.</p>
        <dl className="mt-6 grid gap-2 text-left text-sm">
          <div className="flex justify-between gap-4"><dt className="text-text-muted">Tour</dt><dd className="font-semibold">{b.tourName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-text-muted">Cuándo</dt><dd className="font-semibold first-letter:uppercase">{when}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-text-muted">Personas</dt><dd className="font-semibold">{b.people}</dd></div>
          {b.meetingPoint && <div className="flex justify-between gap-4"><dt className="text-text-muted">Punto de encuentro</dt><dd className="font-semibold">{b.meetingPoint}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-text-muted">Pago</dt><dd className="font-semibold">{b.payment === "free" ? "A la voluntad, al final" : `${money(b.grossCents, b.currency)} en el punto de encuentro`}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-text-muted">Código</dt><dd className="tnum font-semibold">{code}</dd></div>
        </dl>
      </Card>
      <Link href={`/g/${slug}`} className="text-center text-sm text-accent underline">Ver otros tours de {b.companyName}</Link>
    </main>
  );
}
