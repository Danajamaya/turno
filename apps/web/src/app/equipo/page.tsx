import type { Metadata } from "next";
import Link from "next/link";
import { Hash, Plus } from "lucide-react";
import { addLocalDays, localDate, localRange } from "@turno/core";
import { Banner } from "@/components/ui";
import * as chat from "@/lib/chat";
import { hm, dayLabel } from "@/lib/format";
import { calendar } from "@/lib/guides";
import { requireSession } from "@/lib/session";
import { createChannelAction, openDirectAction } from "./actions";
import { Thread, type TourOption } from "./thread";

export const metadata: Metadata = { title: "Equipo" };
export const dynamic = "force-dynamic";

// Team chat: channels for everyone, direct messages, tour cards. Like Teams, for guides.
export default async function TeamChatPage({ searchParams }: { searchParams: Promise<{ c?: string; error?: string }> }) {
  const s = await requireSession();
  const q = await searchParams;
  await chat.ensureDefaultChannels(s);
  const [channels, people] = await Promise.all([chat.listChannels(s), chat.teammates(s)]);
  const current = channels.find((c) => c.id === q.c) ?? channels.find((c) => c.name === "general") ?? channels[0];
  const msgs = current ? await chat.messages(s, current.id) : [];
  if (current) await chat.markRead(s, current.id);
  const manager = s.member.role !== "employee";
  const tz = s.location.timezone;

  // Tours a manager can drop into the conversation: the next 7 days, grouped like the calendar.
  let tours: TourOption[] = [];
  if (manager) {
    const today = localDate(new Date(), tz);
    const list = (await calendar(s, new Date(), localRange(addLocalDays(today, 7), 1, tz).end)).filter((b) => b.status !== "cancelled");
    const by = new Map<string, TourOption>();
    for (const b of list) {
      const key = `${b.startsAt}|${b.tourName ?? ""}`;
      const t = by.get(key) ?? { key, startsAt: b.startsAt, tourName: b.tourName ?? "Tour", people: 0, platforms: [], label: "" };
      t.people += b.people;
      if (!t.platforms.includes(b.platform)) t.platforms.push(b.platform);
      t.label = `${dayLabel(localDate(new Date(b.startsAt), tz))} ${hm(b.startsAt, tz)} · ${t.tourName} · ${t.people} p.`;
      by.set(key, t);
    }
    tours = [...by.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 30);
  }

  const teamChannels = channels.filter((c) => c.kind === "channel"), directs = channels.filter((c) => c.kind === "direct");
  const withoutDm = people.filter((p) => !directs.some((d) => d.otherMemberId === p.id));
  const item = (c: chat.ChatChannel) => (
    <Link key={c.id} href={`/equipo?c=${c.id}`} aria-current={c.id === current?.id ? "page" : undefined}
      className={`flex min-h-tap items-center gap-2.5 rounded-md px-2 text-sm ${c.id === current?.id ? "bg-accent-soft font-semibold text-accent" : "hover:bg-surface"}`}>
      {c.kind === "channel"
        ? <span className="grid h-7 w-7 place-items-center rounded-md bg-surface text-text-muted"><Hash aria-hidden size={15} /></span>
        : <span className={`grid h-7 w-7 place-items-center rounded-pill text-xs font-bold bg-role-${c.otherColour ?? 1} text-role-${c.otherColour ?? 1}-text`}>{c.name.slice(0, 1)}</span>}
      <span className="min-w-0 flex-1 truncate">{c.name}</span>
      {c.unread > 0 && <span className="tnum rounded-pill bg-accent px-2 text-xs font-bold text-on-accent" aria-label={`${c.unread} sin leer`}>{c.unread}</span>}
    </Link>
  );

  return (
    <div className="grid min-h-[calc(100vh-4px)] md:grid-cols-[260px_1fr]">
      <aside className="border-b border-border bg-surface-raised p-3 md:border-b-0 md:border-r" aria-label="Conversaciones">
        <h1 className="mb-2 px-2 font-serif text-lg">Equipo</h1>
        {q.error && <div className="mb-2"><Banner tone="danger" role="alert">{q.error}</Banner></div>}
        <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Canales</p>
        <div className="grid gap-0.5">{teamChannels.map(item)}</div>
        {manager && (
          <form action={createChannelAction} className="mt-1 flex gap-1 px-1">
            <label htmlFor="new-channel" className="sr-only">Nuevo canal</label>
            <input id="new-channel" name="name" placeholder="Nuevo canal" maxLength={40} className="h-9 min-w-0 flex-1 rounded-md border border-border-input bg-bg px-2 text-sm" />
            <button aria-label="Crear canal" className="grid h-9 w-9 place-items-center rounded-md border border-border-input bg-bg hover:bg-surface"><Plus aria-hidden size={16} /></button>
          </form>
        )}
        <p className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-text-muted">Mensajes directos</p>
        <div className="grid gap-0.5">{directs.map(item)}</div>
        {withoutDm.length > 0 && (
          <div className="mt-1 grid gap-0.5">
            {withoutDm.map((p) => (
              <form key={p.id} action={openDirectAction}>
                <input type="hidden" name="memberId" value={p.id} />
                <button className="flex min-h-tap w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-text-muted hover:bg-surface">
                  <span className={`grid h-7 w-7 place-items-center rounded-pill text-xs font-bold bg-role-${p.colour} text-role-${p.colour}-text`}>{p.fullName.slice(0, 1)}</span>
                  <span className="truncate">{p.fullName}</span>
                </button>
              </form>
            ))}
          </div>
        )}
      </aside>
      {current ? (
        <Thread key={current.id} me={{ id: s.member.id, name: s.member.fullName, colour: s.member.colour }} channel={{ id: current.id, name: current.name, kind: current.kind, topic: current.topic }}
          initial={msgs} tours={tours} tz={tz} />
      ) : <p className="p-6 text-text-muted">Todavía no hay conversaciones.</p>}
    </div>
  );
}
