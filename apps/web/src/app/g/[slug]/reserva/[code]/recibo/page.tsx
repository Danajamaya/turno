import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { system } from "@/lib/db";
import { money } from "@/lib/format";
import { pickLang } from "@/lib/i18n";
import { bookingByCode } from "@/lib/marketplace";
import { PrintButton } from "./print";

export const metadata: Metadata = { title: "Recibo", robots: { index: false } };
export const dynamic = "force-dynamic";

// A simplified invoice for a booking made on Turno, issued in the guide's name.
export default async function Receipt({ params, searchParams }: { params: Promise<{ slug: string; code: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug, code } = await params;
  const en = (await pickLang((await searchParams).lang)) === "en";
  const b = await bookingByCode(slug, code);
  if (!b) notFound();
  const [c] = await system((tx) => tx<{ name: string; legalName: string | null; taxId: string | null; fiscalAddress: string | null }[]>`select name, legal_name, tax_id, fiscal_address from companies where id = ${b.companyId}`);
  const paid = b.grossCents - b.giftCents;
  const fmt = new Intl.DateTimeFormat(en ? "en-GB" : "es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: b.timezone });
  return (
    <main className="mx-auto max-w-xl bg-bg px-6 py-10 print:py-0">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div><p className="font-serif text-xl">{c.legalName ?? c.name}</p>{c.taxId && <p className="text-sm">{en ? "Tax ID" : "NIF"}: {c.taxId}</p>}{c.fiscalAddress && <p className="text-sm text-text-muted">{c.fiscalAddress}</p>}</div>
        <div className="text-right text-sm"><p className="font-semibold">{en ? "Simplified invoice" : "Factura simplificada"}</p><p>{code}</p></div>
      </header>
      <table className="tnum w-full text-sm">
        <tbody>
          <tr className="border-b border-border"><td className="py-2">{b.tourName}<span className="block text-xs text-text-muted">{fmt.format(new Date(b.startsAt))}, {b.people} {en ? "people" : "personas"}</span></td><td className="py-2 text-right">{money(b.grossCents + b.discountCents, b.currency)}</td></tr>
          {b.discountCents > 0 && <tr className="border-b border-border"><td className="py-2">{en ? "Discount" : "Descuento"}</td><td className="text-right">−{money(b.discountCents, b.currency)}</td></tr>}
          {b.giftCents > 0 && <tr className="border-b border-border"><td className="py-2">{en ? "Paid with gift card" : "Pagado con tarjeta regalo"}</td><td className="text-right">−{money(b.giftCents, b.currency)}</td></tr>}
          <tr className="font-bold"><td className="py-3">{en ? "Total" : "Total"}</td><td className="text-right">{money(paid, b.currency)}</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-text-muted">{en ? "VAT included where applicable." : "IVA incluido cuando corresponda."} {b.depositPaidAt ? (en ? `Deposit of ${money(b.depositCents, b.currency)} paid online.` : `Señal de ${money(b.depositCents, b.currency)} pagada en línea.`) : ""}</p>
      {!c.taxId && <p className="mt-4 rounded-md bg-warning-soft p-3 text-xs text-warning">{en ? "The guide has not added their tax details yet." : "El guía todavía no ha añadido sus datos fiscales."}</p>}
      <PrintButton label={en ? "Print or save as PDF" : "Imprimir o guardar en PDF"} />
    </main>
  );
}
