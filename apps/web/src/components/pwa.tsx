"use client";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Registers the service worker once per load. Rendered in the root layout. */
export function RegisterServiceWorker() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {}); }, []);
  return null;
}

const b64ToBytes = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

/** "Notify me on this phone": asks permission, subscribes and tells the server. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("busy");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((sub) => setState(sub ? "on" : "off")).catch(() => setState("off"));
  }, [publicKey]);
  const toggle = async () => {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await fetch("/api/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); setState("off"); return; }
      if ((await Notification.requestPermission()) !== "granted") { setState("denied"); return; }
      const created = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey!) });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(created.toJSON()) });
      setState(res.ok ? "on" : "off");
    } catch { setState("off"); }
  };
  if (state === "unsupported") return <p className="text-sm text-text-muted">Este navegador no admite avisos, o todavía no están activados en el servidor. En iPhone, primero añade Turno a la pantalla de inicio.</p>;
  if (state === "denied") return <p className="text-sm text-text-muted">Bloqueaste los avisos. Actívalos en los ajustes del navegador para este sitio.</p>;
  return (
    <button type="button" onClick={toggle} disabled={state === "busy"} className="inline-flex items-center gap-2 rounded-md border border-border-input px-4 py-2.5 text-sm font-semibold hover:border-text disabled:opacity-60">
      {state === "on" ? <><BellOff aria-hidden size={16} />Dejar de avisarme en este teléfono</> : <><Bell aria-hidden size={16} />Avisarme en este teléfono</>}
    </button>
  );
}
