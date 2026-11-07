"use client";
import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { replyInquiryAction, suggestRepliesAction } from "@/app/growth-actions";
import { ActionForm, Submit } from "@/components/forms";

// Write the answer, or start from a suggested draft and edit it.
export function ReplyBox({ id }: { id: string }) {
  // the form remounts its children after a successful send, which clears the draft
  return <ActionForm action={replyInquiryAction} className="grid gap-2" resetOnOk>{() => <Draft id={id} />}</ActionForm>;
}

function Draft({ id }: { id: string }) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<string[] | null>(null);
  const [source, setSource] = useState<"claude" | "templates" | null>(null);
  const [busy, start] = useTransition();
  return (
        <>
          <input type="hidden" name="id" value={id} />
          <label htmlFor={`r-${id}`} className="sr-only">Tu respuesta</label>
          <textarea id={`r-${id}`} name="body" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Escribe tu respuesta…" className="w-full rounded-md border border-border-input bg-bg px-3 py-2 text-sm" />
          {drafts && (
            <div className="grid gap-1.5">
              <p className="text-xs text-text-muted">{source === "claude" ? "Sugerencias escritas con IA a partir de tus tours. Toca una para usarla y edítala." : "Sugerencias a partir de tus tours. Toca una para usarla y edítala."}</p>
              {drafts.map((d, i) => <button key={i} type="button" onClick={() => setText(d)} className="rounded-md border border-border bg-surface px-3 py-2 text-left text-sm hover:border-text">{d}</button>)}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => start(async () => { const r = await suggestRepliesAction(id); setDrafts(r.drafts); setSource(r.source); })}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-input px-3 py-2 text-sm font-semibold hover:border-text disabled:opacity-60"><Sparkles aria-hidden size={15} />{busy ? "Pensando…" : "Sugerir respuestas"}</button>
            <Submit size="sm">Enviar respuesta</Submit>
          </div>
        </>
  );
}
