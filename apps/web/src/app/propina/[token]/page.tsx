import type { Metadata } from "next";
import { HandCoins } from "lucide-react";
import { startTipAction } from "@/app/growth-actions";
import { TipForm } from "./tip-form";
import { hm } from "@/lib/format";
import { pickLang } from "@/lib/i18n";
import { tipPage } from "@/lib/tips";

export const metadata: Metadata = { title: "Deja una propina" };
export const dynamic = "force-dynamic";

// What a traveller sees after scanning the guide's QR at the end of the tour.
export default async function TipPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ gracias?: string; lang?: string }> }) {
  const { token } = await params;
  const q = await searchParams;
  const en = (await pickLang(q.lang)) === "en";
  const page = await tipPage(token);
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-4 py-10">
      {!page ? <p className="text-center text-text-muted">{en ? "This link isn't valid." : "Este enlace no es válido."}</p> : q.gracias ? (
        <section className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-pill bg-gold-soft text-gold-ink"><HandCoins aria-hidden size={30} /></span>
          <h1 className="mt-4 font-serif text-xl">{en ? "Thank you!" : "¡Gracias!"}</h1>
          <p className="mt-2 text-text-muted">{en ? `${page.guideName ?? page.companyName} will get your tip.` : `${page.guideName ?? page.companyName} recibirá tu propina.`}</p>
        </section>
      ) : (
        <>
          <header className="text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-pill bg-gold-soft text-gold-ink"><HandCoins aria-hidden size={30} /></span>
            <h1 className="mt-4 font-serif text-xl">{en ? `Did you enjoy the tour with ${page.guideName ?? page.companyName}?` : `¿Te gustó el tour con ${page.guideName ?? page.companyName}?`}</h1>
            <p className="mt-1 text-text-muted">{page.tourName}, {hm(page.startsAt, page.timezone)}</p>
          </header>
          <TipForm action={startTipAction} token={token} currency={page.currency} en={en} />
          <p className="text-center text-xs text-text-muted">{en ? "Secure card payment. Apple Pay and Google Pay where available." : "Pago seguro con tarjeta. Apple Pay y Google Pay donde estén disponibles."}</p>
        </>
      )}
    </main>
  );
}
