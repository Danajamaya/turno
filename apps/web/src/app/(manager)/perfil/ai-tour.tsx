"use client";
import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { draftTourAction } from "@/app/pro-actions";
import { Banner } from "@/components/ui";
import type { Tour } from "@/lib/marketplace";
import type { TourDraft } from "@/lib/tour-ai";
import { TourForm } from "./forms";

// Describe the tour in a sentence, get a first draft in the normal tour form, edit, save.
export function AiTourCreator({ currency, locations }: { currency: string; locations: { id: string; name: string }[] }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<TourDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const tour: Tour | undefined = draft ? {
    id: "", title: draft.title, description: draft.description, meetingPoint: draft.meetingPoint, durationMin: draft.durationMin, capacity: 20, priceModel: draft.priceModel,
    priceCents: draft.priceCents, currency, published: false, maxPeoplePerBooking: 10, weeklySlots: [], sort: 0, includes: draft.includes, stops: draft.stops,
  } : undefined;
  return (
    <div className="grid gap-3">
      <label htmlFor="ai-text" className="text-sm font-semibold">Cuéntalo como se lo contarías a un amigo</label>
      <textarea id="ai-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} className="w-full rounded-md border border-border-input bg-bg px-3 py-2"
        placeholder="Ruta de tapas de 3 horas por La Latina y el Mercado de San Miguel, 4 tapas y 2 vinos incluidos, grupos de máximo 10" />
      {error && <Banner tone="danger" role="alert">{error}</Banner>}
      <div><button type="button" disabled={busy} onClick={() => start(async () => {
        setError("");
        const r = await draftTourAction(text);
        if (r.error) setError(r.error); else if (r.draft) setDraft(r.draft);
      })} className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 font-semibold text-on-accent disabled:opacity-60"><Sparkles aria-hidden size={16} />{busy ? "Preparando…" : "Preparar el tour"}</button></div>
      {draft && tour && (
        <div className="mt-2 grid gap-3 border-t border-border pt-4">
          <p className="text-sm text-text-muted">{draft.source === "claude" ? "Borrador escrito con IA." : "Borrador a partir de lo que escribiste."} {draft.priceNote} Revísalo, añade horarios y guarda.</p>
          <TourForm key={draft.title} tour={tour} currency={currency} locations={locations} />
        </div>
      )}
    </div>
  );
}
