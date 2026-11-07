import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { reviewByToken } from "@/lib/crm";
import { pickLang, t } from "@/lib/i18n";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Reseña", robots: { index: false } };
export const dynamic = "force-dynamic";

// The traveller's review link: one review per real booking.
export default async function ReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string; ok?: string }> }) {
  const { token } = await params;
  const q = await searchParams;
  const lang = await pickLang(q.lang), l = t(lang);
  const r = await reviewByToken(token);
  return (
    <main className="mx-auto grid max-w-lg gap-4 px-4 py-12">
      <Card>
        {!r ? <p>{l.linkInvalid}</p> : r.submittedAt ? <p className="text-center font-serif text-lg">{q.ok ? l.thanks : l.alreadySent}</p> : (
          <>
            <h1 className="font-serif text-xl">{l.rateTitle}</h1>
            <p className="mb-5 mt-1 text-text-muted">{l.rateSub(r.tourName ?? "tour", r.companyName)}</p>
            <ReviewForm token={token} lang={lang} name={r.travellerName?.split(" ")[0] ?? ""} />
          </>
        )}
      </Card>
    </main>
  );
}
