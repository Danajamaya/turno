import type { Metadata } from "next";
import Link from "next/link";
import { travellerReplyAction } from "@/app/growth-actions";
import { TravellerReply } from "./reply";
import { inquiryByToken } from "@/lib/inquiries";

export const metadata: Metadata = { title: "Tu conversación", robots: { index: false } };
export const dynamic = "force-dynamic";

// The traveller's private view of their question and the guide's answers.
export default async function InquiryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await inquiryByToken(token);
  if (!t) return <main className="mx-auto max-w-md px-4 py-16 text-center text-text-muted">Este enlace no es válido o ya hay uno más nuevo en tu correo. / This link is not valid, or there is a newer one in your email.</main>;
  const en = t.language === "en";
  const fmt = new Intl.DateTimeFormat(en ? "en-GB" : "es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <main className="mx-auto grid max-w-xl gap-5 px-4 py-10">
      <header>
        <p className="text-sm text-text-muted">{en ? "Your conversation with" : "Tu conversación con"}</p>
        <h1 className="font-serif text-xl">{t.companyName}</h1>
      </header>
      <ol className="grid gap-3">
        {t.messages.map((m, i) => (
          <li key={i} className={`max-w-[85%] rounded-lg px-4 py-3 ${m.fromTraveller ? "ml-auto bg-accent-soft" : "bg-surface"}`}>
            <span className="block text-xs text-text-muted">{m.fromTraveller ? (en ? "You" : "Tú") : m.memberName ?? t.companyName}, {fmt.format(new Date(m.createdAt))}</span>
            <span className="whitespace-pre-wrap">{m.body}</span>
          </li>
        ))}
      </ol>
      <TravellerReply action={travellerReplyAction} token={token} en={en} />
      <p className="text-center text-xs text-text-muted"><Link href="/guias" className="underline">Turno</Link></p>
    </main>
  );
}
