import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Gift } from "lucide-react";
import { startGiftAction } from "@/app/growth-actions";
import { PublicHeader } from "@/components/public-header";
import { TourCover } from "@/components/postcard";
import { pickLang } from "@/lib/i18n";
import { publicProfile } from "@/lib/marketplace";
import { GiftForm } from "./gift-form";

export const metadata: Metadata = { title: "Regala un tour" };
export const dynamic = "force-dynamic";

// Buy a gift card for a friend: an amount to spend on any tour of this guide.
export default async function GiftPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string; listo?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const lang = await pickLang(q.lang), en = lang === "en";
  const p = await publicProfile(slug);
  if (!p) notFound();
  return (
    <div className="min-h-screen bg-bg">
      <PublicHeader lang={lang} path={`/g/${slug}/regalo`}>
        <Link href={`/g/${slug}?lang=${lang}`} className="inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text"><ChevronLeft aria-hidden size={16} />{p.companyName}</Link>
      </PublicHeader>
      <main className="mx-auto grid max-w-content gap-10 px-4 py-10 md:px-8 lg:grid-cols-[1fr_440px]">
        <section>
          <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
            <TourCover title={p.tours[0]?.title ?? p.companyName} time="18:30" about={p.tours[0]?.description ?? ""} />
            <span className="absolute left-5 top-5 grid h-14 w-14 place-items-center rounded-pill bg-bg text-ch-strawberry shadow-pop"><Gift aria-hidden size={28} /></span>
          </div>
          <h1 className="mt-6 font-serif text-xl md:text-display">{en ? `Give a tour with ${p.companyName}` : `Regala un tour con ${p.companyName}`}</h1>
          <p className="mt-2 max-w-[60ch] text-lg text-text-muted">{en
            ? "They choose the tour and the day. The card arrives by email with a code to use when booking."
            : "Elige el importe; la otra persona elige tour y día. Le llega por correo con un código para usar al reservar."}</p>
        </section>
        <section className="rounded-lg border border-border p-6 shadow-pop">
          {q.listo ? (
            <div role="status">
              <p className="text-lg font-semibold">✓ {en ? "Gift card ready" : "Tarjeta regalo lista"}</p>
              <p className="tnum mt-2 rounded-md bg-surface p-4 text-center font-serif text-xl tracking-wide">{q.listo}</p>
              <p className="mt-3 text-sm text-text-muted">{en ? "We emailed the code. It works on any tour with a price." : "Te mandamos el código por correo. Sirve para cualquier tour con precio."}</p>
            </div>
          ) : <GiftForm action={startGiftAction} slug={slug} currency={p.currency} en={en} />}
        </section>
      </main>
    </div>
  );
}
