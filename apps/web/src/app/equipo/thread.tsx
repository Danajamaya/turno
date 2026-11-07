"use client";
import { useEffect, useRef, useState } from "react";
import { Hash, MapPin, Send, Users } from "lucide-react";
import type { ChatMessage, TourCard } from "@/lib/chat";

export interface TourOption { key: string; startsAt: string; tourName: string; people: number; platforms: string[]; label: string }

const POLL_MS = 4000;
const names: Record<string, string> = { guruwalk: "GuruWalk", freetour: "Freetour.com", strawberry: "Strawberry Tours", getyourguide: "GetYourGuide", viator: "Viator", civitatis: "Civitatis", turno: "Turno" };
const time = (iso: string, tz: string) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
const day = (iso: string, tz: string) => new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date(iso));

// One conversation: polls for new messages, sends with an optimistic echo,
// and lets a manager drop a tour card into the thread.
export function Thread({ me, channel, initial, tours, tz }: {
  me: { id: string; name: string; colour: number };
  channel: { id: string; name: string; kind: "channel" | "direct"; topic: string | null };
  initial: ChatMessage[]; tours: TourOption[]; tz: string;
}) {
  const [list, setList] = useState(initial);
  const [text, setText] = useState("");
  const [tourKey, setTourKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const last = list.at(-1)?.createdAt;

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [list.length]);
  useEffect(() => {
    const t = setInterval(async () => {
      const url = `/api/equipo/messages?c=${channel.id}${last ? `&after=${encodeURIComponent(last)}` : ""}`;
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const fresh: ChatMessage[] = await res.json();
      if (fresh.length) setList((cur) => [...cur, ...fresh.filter((m) => !cur.some((c) => c.id === m.id))]);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [channel.id, last]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const tour = tours.find((t) => t.key === tourKey);
    const body = text.trim() || (tour ? `Comparto el tour: ${tour.tourName}` : "");
    if (!body || sending) return;
    setSending(true); setError(null);
    const card: TourCard | null = tour ? { type: "tour", startsAt: tour.startsAt, tourName: tour.tourName, people: tour.people, platforms: tour.platforms } : null;
    const res = await fetch("/api/equipo/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId: channel.id, body, tour: card }) }).catch(() => null);
    setSending(false);
    if (!res?.ok) { setError((await res?.json().catch(() => null))?.error ?? "No se pudo enviar. Revisa tu conexión."); return; }
    const m: ChatMessage = await res.json();
    setList((cur) => (cur.some((c) => c.id === m.id) ? cur : [...cur, m]));
    setText(""); setTourKey("");
  }

  let lastDay = "";
  return (
    <section className="flex min-h-[70vh] flex-col bg-surface md:h-[calc(100vh-4px)]" aria-label={`Conversación ${channel.name}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-raised px-5 py-3">
        {channel.kind === "channel" ? <span className="grid h-8 w-8 place-items-center rounded-md bg-accent-soft text-accent"><Hash aria-hidden size={16} /></span> : null}
        <div className="min-w-0">
          <h2 className="truncate text-lg">{channel.name}</h2>
          {channel.topic && <p className="truncate text-xs text-text-muted">{channel.topic}</p>}
        </div>
      </header>
      <div tabIndex={0} role="log" aria-label={`Historial de ${channel.name}`} className="flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
        {list.length === 0 && <p className="py-10 text-center text-sm text-text-muted">Todavía no hay mensajes. Escribe el primero.</p>}
        <ol className="grid gap-4">
          {list.map((m) => {
            const d = day(m.createdAt, tz), showDay = d !== lastDay; lastDay = d;
            const mine = m.memberId === me.id, colour = m.authorColour ?? 8, card = m.attachment;
            return (
              <li key={m.id}>
                {showDay && <p className="mb-3 text-center text-xs text-text-muted first-letter:uppercase">{d}</p>}
                <div className={`flex items-start gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                  <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-pill text-sm font-bold bg-role-${colour} text-role-${colour}-text`}>{(m.authorName ?? "?").slice(0, 1)}</span>
                  <div className={`min-w-0 max-w-[min(42rem,85%)] ${mine ? "text-right" : ""}`}>
                    <p className="text-sm font-semibold">{mine ? "Tú" : m.authorName ?? "Alguien que ya no está"} <span className="tnum font-normal text-text-muted">{time(m.createdAt, tz)}</span></p>
                    <p className={`mt-1 inline-block whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-left text-sm ${mine ? "bg-accent text-on-accent" : "border border-border bg-surface-raised"}`}>{m.body}</p>
                    {card?.type === "tour" && (
                      <div className={`mt-2 rounded-md border border-border border-l-4 bg-surface-raised p-3 text-left text-sm shadow-card border-l-ch-${card.platforms[0] ?? "turno"}`}>
                        <p className="font-semibold">{card.tourName}</p>
                        <p className="tnum mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-muted">
                          <span className="first-letter:uppercase">{day(card.startsAt, tz)} · {time(card.startsAt, tz)}</span>
                          <span className="inline-flex items-center gap-1"><Users aria-hidden size={13} />{card.people} personas</span>
                          <span className="inline-flex items-center gap-1"><MapPin aria-hidden size={13} />{card.platforms.map((p) => names[p] ?? p).join(", ")}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={bottom} />
      </div>
      <form onSubmit={submit} className="grid gap-2 border-t border-border bg-surface-raised px-5 py-3">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {tours.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Adjuntar tour
            <select value={tourKey} onChange={(e) => setTourKey(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border-input bg-bg px-2 text-sm text-text">
              <option value="">Ninguno</option>
              {tours.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          <label htmlFor="msg" className="sr-only">Mensaje</label>
          <textarea id="msg" rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
            placeholder={channel.kind === "channel" ? `Escribe a #${channel.name}…` : `Escribe a ${channel.name}…`}
            className="min-h-[44px] flex-1 resize-none rounded-md border border-border-input bg-bg px-3 py-2.5 text-base" />
          <button disabled={sending || (!text.trim() && !tourKey)} aria-label="Enviar" className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-accent text-on-accent disabled:opacity-40"><Send aria-hidden size={18} /></button>
        </div>
      </form>
    </section>
  );
}
