import type { Metadata } from "next";
import { Check } from "lucide-react";
import { checkoutAction, portalAction } from "@/app/actions";
import { Banner, Button, PageHeader } from "@/components/ui";
import { system } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { subscriptionFor } from "@/lib/store";
import { PlanCalculator } from "./calculator";

export const metadata: Metadata = { title: "Planes" };

// Monthly fees are proposals until the owner sets the Stripe prices; commissions come from platform_settings.
const PLANS = [
  { id: "free", name: "Gratis", fee: 0, per: "/mes", edge: "border-t-side-muted", items: ["1 local y hasta 10 personas", "Calendario con todas tus plataformas", "Reenvío de correos de reservas", "Perfil público con tus tours", "Ingresos por plataforma", "Chat Equipo"] },
  { id: "essentials", name: "Pro", fee: 19, per: "/mes por local", edge: "border-t-gold", featured: true, items: ["Todo lo de Gratis, sin límite de personas", "Menos comisión en tus ventas en Turno", "Sincronizar con Google, Apple y Outlook", "App del guía: pasar lista y propinas", "Asignar guías a cada tour"] },
  { id: "plus", name: "Agencia", fee: 59, per: "/mes por local", edge: "border-t-accent", items: ["Todo lo de Pro", "La menor comisión en ventas en Turno", "Varios locales", "Pagos y comisiones por guía", "API directa GetYourGuide y Viator (al estar disponible)"] },
] as const;

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const [sub, [bps]] = await Promise.all([subscriptionFor(s), system((tx) => tx<{ commissionBpsFree: number; commissionBpsPaid: number; commissionBpsPlus: number }[]>`select commission_bps_free, commission_bps_paid, commission_bps_plus from platform_settings`)]);
  const commission = { free: bps.commissionBpsFree / 100, essentials: bps.commissionBpsPaid / 100, plus: bps.commissionBpsPlus / 100 };
  const owner = s.member.role === "owner";
  return (
    <>
      <PageHeader title="Planes" />
      <div className="mb-5 grid gap-3">
        {q.pago === "off" && <Banner tone="warning" role="alert">Los cobros todavía no están configurados en este servidor.</Banner>}
        <Banner tone="info">La comisión solo se cobra en lo que vendes en Turno. Las reservas de GuruWalk, Freetour, GetYourGuide y las demás no pagan comisión a Turno. Precios provisionales.</Banner>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const current = sub.plan === p.id;
          return (
            <section key={p.id} className={`relative flex flex-col gap-4 rounded-lg border border-t-4 bg-surface-raised p-6 shadow-card ${p.edge} ${"featured" in p ? "border-gold" : "border-border"}`}>
              {"featured" in p && <span className="absolute -top-3 left-5 rounded-pill bg-gold px-3 py-0.5 text-xs font-bold text-on-gold">El más elegido</span>}
              <h2 className="font-serif text-lg">{p.name}</h2>
              <p className="tnum font-serif text-display leading-none">{p.fee} €<span className="ml-1 font-sans text-sm font-normal text-text-muted">{p.per}</span></p>
              <p className="rounded-md bg-surface px-3 py-2 text-sm text-text-muted"><b className="tnum text-lg text-text">{commission[p.id]} %</b> de comisión en ventas hechas en Turno</p>
              <ul className="grid gap-2 text-sm">{p.items.map((i) => <li key={i} className="flex gap-2"><Check aria-hidden size={16} className="mt-0.5 shrink-0 text-success" />{i}</li>)}</ul>
              <div className="mt-auto">
                {current ? <p className="rounded-md border border-success px-3 py-2 text-center text-sm font-semibold text-success">Tu plan actual</p>
                  : !owner ? <p className="text-center text-sm text-text-muted">Solo el dueño puede cambiar el plan.</p>
                  : p.id === "free" ? <form action={portalAction}><Button variant="secondary" className="w-full">Volver a Gratis</Button></form>
                  : <form action={checkoutAction}><input type="hidden" name="plan" value={p.id} /><Button variant={"featured" in p ? "primary" : "secondary"} className="w-full">Cambiar a {p.name}</Button></form>}
              </div>
            </section>
          );
        })}
      </div>
      <section className="mt-6 rounded-lg border border-border bg-surface-raised p-6 shadow-card">
        <h2 className="font-serif text-lg">¿Qué plan te conviene?</h2>
        <p className="mb-4 text-sm text-text-muted">Mueve la barra según lo que vendes en Turno al mes.</p>
        <PlanCalculator plans={PLANS.map((p) => ({ name: p.name, fee: p.fee, pct: commission[p.id] }))} currency={s.company.currency} />
      </section>
    </>
  );
}
