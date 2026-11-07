"use client";
import { useState } from "react";

export function PlanCalculator({ plans, currency }: { plans: { name: string; fee: number; pct: number }[]; currency: string }) {
  const [sales, setSales] = useState(1500);
  const fmt = (v: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  const cost = plans.map((p) => ({ ...p, total: p.fee + (sales * p.pct) / 100 }));
  const best = cost.reduce((a, b) => (b.total < a.total ? b : a));
  return (
    <div className="grid items-center gap-6 md:grid-cols-2">
      <div>
        <label htmlFor="sales" className="font-semibold">Ventas en Turno al mes: <span className="tnum">{fmt(sales)}</span></label>
        <input id="sales" type="range" min={0} max={8000} step={100} value={sales} onChange={(e) => setSales(+e.target.value)} className="mt-2 w-full accent-accent" />
      </div>
      <div className="tnum grid gap-1 text-sm" aria-live="polite">
        {cost.map((c) => <p key={c.name}>{c.name}: <b>{fmt(c.total)}</b> al mes <span className="text-text-muted">(cuota {fmt(c.fee)} + comisión {fmt((sales * c.pct) / 100)})</span></p>)}
        <p className="mt-1">Te conviene <b>{best.name}</b>.</p>
      </div>
    </div>
  );
}
