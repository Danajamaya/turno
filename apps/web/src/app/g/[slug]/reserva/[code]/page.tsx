import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui";
import { money } from "@/lib/format";
import { bookingByCode } from "@/lib/marketplace";
import { localeOf, pickLang, t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Reserva confirmada", robots: { index: false } };

export default async function Confirmed({ params, searchParams }: { params: Promise<{ slug: string; code: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug, code } = await params;
  const lang = await pickLang((await searchParams).lang), l = t(lang);
  const b = await bookingByCode(slug, code);
  if (!b) notFound();
  const when = new Intl.DateTimeFormat(localeOf(lang), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: b.timezone }).format(new Date(b.startsAt));
  return (
    <main className="mx-auto grid max-w-lg gap-4 px-4 py-12">
      <Card className="text-center">
        <CheckCircle2 aria-hidden className="mx-auto mb-3 text-success" size={48} />
        <h1 className="font-serif text-xl">{l.confirmed}</h1>
        <p className="mt-1 text-text-muted">{l.confirmedSub}</p>
        <dl className="mt-6 grid gap-2 text-left text-sm">
          <div className="flex justify-between gap-4"><dt className="text-text-muted">{l.tour}</dt><dd className="font-semibold">{b.tourName}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-text-muted">{l.when}</dt><dd className="font-semibold first-letter:uppercase">{when}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-text-muted">{l.people}</dt><dd className="font-semibold">{b.people}</dd></div>
          {b.meetingPoint && <div className="flex justify-between gap-4"><dt className="text-text-muted">{l.meeting}</dt><dd className="font-semibold">{b.meetingPoint}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-text-muted">{l.payment}</dt><dd className="text-right font-semibold">{b.payment === "free" ? l.payTip : b.giftCents > 0
            ? <>{l.giftPaid(money(b.giftCents, b.currency))}{b.grossCents > b.giftCents && <span className="block">{l.giftRest(money(b.grossCents - b.giftCents, b.currency))}</span>}</>
            : l.payOnSite(money(b.grossCents, b.currency))}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-text-muted">{l.code}</dt><dd className="tnum font-semibold">{code}</dd></div>
        </dl>
      </Card>
      <Link href={`/g/${slug}?lang=${lang}`} className="text-center text-sm text-accent underline">{l.otherTours(b.companyName)}</Link>
    </main>
  );
}
