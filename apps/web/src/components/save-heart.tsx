"use client";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";

// Travellers keep a shortlist on their own device, like a wishlist. Nothing is sent anywhere.
const KEY = "turno.saved";
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };

export function SaveHeart({ id, label }: { id: string; label: string }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(read().includes(id)), [id]);
  const toggle = () => {
    const list = read(), next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep it for this page only */ }
    setSaved(next.includes(id));
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={saved} aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-pill text-bg transition-transform duration-fast ease-brand active:scale-90">
      <Heart aria-hidden size={24} strokeWidth={2} className={`drop-shadow ${saved ? "fill-ch-strawberry" : ""}`} style={saved ? undefined : { fill: "rgba(19,32,61,.35)" }} />
    </button>
  );
}
