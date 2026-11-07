"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyLink({ link }: { link: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={link} aria-label="Tu enlace de invitación" className="h-10 min-w-0 flex-1 rounded-md border border-border-input bg-surface px-3 text-sm" onFocus={(e) => e.target.select()} />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* the field is selectable */ } }}
        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-input px-3 text-sm font-semibold">{done ? <><Check aria-hidden size={16} />Copiado</> : <><Copy aria-hidden size={16} />Copiar</>}</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`Uso Turno para tener todas mis reservas de tours en un sitio. Con este enlace tu primer mes pagas la mitad de comisión: ${link}`)}`} className="inline-flex h-10 items-center rounded-md border border-border-input px-3 text-sm font-semibold">WhatsApp</a>
    </div>
  );
}
