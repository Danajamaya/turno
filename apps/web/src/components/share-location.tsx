"use client";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { shareLocationAction } from "@/app/pro-actions";

// The guide taps once to tell latecomers where the group is now.
export function ShareLocation({ tourKey }: { tourKey: string }) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const share = () => {
    if (!("geolocation" in navigator)) { setState("error"); setMsg("Este teléfono no da la ubicación."); return; }
    setState("busy");
    navigator.geolocation.getCurrentPosition(async (p) => {
      const r = await shareLocationAction(tourKey, p.coords.latitude, p.coords.longitude);
      setState(r.ok ? "ok" : "error"); setMsg(r.ok ? `Actualizado a las ${new Date().toTimeString().slice(0, 5)}` : r.error ?? "No se pudo guardar.");
    }, () => { setState("error"); setMsg("Permite la ubicación para compartirla."); }, { enableHighAccuracy: true, timeout: 10_000 });
  };
  return (
    <div className="grid gap-1">
      <button type="button" onClick={share} disabled={state === "busy"} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border-input font-semibold hover:border-text disabled:opacity-60">
        <MapPin aria-hidden size={18} />{state === "busy" ? "Buscando…" : "Compartir dónde está el grupo"}</button>
      {msg && <p role="status" className={`text-center text-xs ${state === "error" ? "text-danger" : "text-text-muted"}`}>{msg}</p>}
    </div>
  );
}
