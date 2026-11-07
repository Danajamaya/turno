import type { Metadata } from "next";
import { checkoutAction, portalAction, signOutEverywhereAction } from "@/app/actions";
import { Badge, Banner, Button, Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { subscriptionFor } from "@/lib/store";
import { FREE_PLAN_PEOPLE } from "@/lib/types";
import { DeleteAccountForm } from "./delete-account-form";
import { summaryText, weekNumbers, weeklySummaryOn } from "@/lib/summary";
import { weeklySummaryAction } from "@/app/growth-actions";
import { connectAction } from "@/app/pro-actions";
import { fiscal, paymentsOn } from "@/lib/money";
import { FiscalForm } from "./fiscal-form";
import { VerifyForm } from "./verify-form";
import { CommsForm } from "./comms-form";
import { system } from "@/lib/db";
import { whatsappOn } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Configuración" };

const planName = { free: "Gratis", essentials: "Esencial", plus: "Plus" } as const;
const statusName = { trialing: "Prueba", active: "Activo", past_due: "Pago pendiente", canceled: "Cancelado", incomplete: "Incompleto" } as const;

// S23 billing and account. Location rules (geofence, breaks, OT) come next.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ pago?: string; cobros?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const [sub, summaryOn, week] = await Promise.all([subscriptionFor(s), weeklySummaryOn(s.company.id), weekNumbers(s.company.id)]);
  const preview = summaryText(week);
  const fis = await fiscal(s);
  const [comms] = await system((tx) => tx<{ whatsappPhoneId: string | null; whatsappAutoReply: boolean; loyaltyPercent: number }[]>`select whatsapp_phone_id, whatsapp_auto_reply, loyalty_percent from companies where id = ${s.company.id}`);
  const owner = s.member.role === "owner";
  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid max-w-2xl gap-6">
        {q.pago === "ok" && <Banner tone="success" role="status">Listo. Tu plan se actualiza en cuanto Stripe confirme el pago.</Banner>}
        {q.pago === "off" && <Banner tone="warning" role="alert">Los cobros todavía no están configurados en este servidor.</Banner>}
        {sub.status === "past_due" && <Banner tone="danger" role="alert">No pudimos cobrar tu último pago. Actualiza tu tarjeta para no perder el servicio.</Banner>}
        <Card>
          <h2 className="mb-1 text-lg">Plan</h2>
          <p className="mb-4 flex items-center gap-2 text-sm text-text-muted">
            {planName[sub.plan]} <Badge tone={sub.status === "active" || sub.status === "trialing" ? "approved" : "pending"}>{statusName[sub.status]}</Badge>
          </p>
          {sub.plan === "free" ? (
            <>
              <p className="mb-4 text-sm">El plan gratis incluye un local y hasta {FREE_PLAN_PEOPLE} personas.</p>
              {owner ? (
                <div className="flex flex-wrap gap-3">
                  <form action={checkoutAction}><input type="hidden" name="plan" value="essentials" /><Button>Cambiar a Esencial</Button></form>
                  <form action={checkoutAction}><input type="hidden" name="plan" value="plus" /><Button variant="secondary">Cambiar a Plus</Button></form>
                </div>
              ) : <p className="text-sm text-text-muted">Solo el dueño puede cambiar el plan.</p>}
            </>
          ) : owner ? (
            <form action={portalAction}>
              <p className="mb-4 text-sm">Cambia de plan, actualiza tu tarjeta o cancela cuando quieras, sin llamadas.</p>
              <Button variant="secondary">Administrar suscripción</Button>
            </form>
          ) : null}
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">Cobros a tu cuenta</h2>
          <p className="mb-3 text-sm text-text-muted">Conecta tu cuenta bancaria con Stripe y lo que se cobre en Turno (señales, propinas con tarjeta, tarjetas regalo) te llega directamente, ya sin la comisión de Turno.</p>
          {q.cobros === "listo" && <div className="mb-3"><Banner tone="success" role="status">Listo. En cuanto Stripe verifique tus datos, los cobros te llegan a tu cuenta.</Banner></div>}
          {q.cobros === "payments_off" && <div className="mb-3"><Banner tone="warning" role="alert">Los cobros todavía no están configurados en este servidor.</Banner></div>}
          {s.company.stripeAccountReady ? <p className="text-sm font-semibold text-success">✓ Conectada: los cobros llegan a tu cuenta.</p>
            : !paymentsOn() ? <p className="text-sm text-text-muted">Disponible cuando Turno active los pagos con tarjeta.</p>
            : owner ? <form action={connectAction}><Button>{s.company.stripeAccountId ? "Terminar de conectar" : "Conectar mi cuenta"}</Button></form>
            : <p className="text-sm text-text-muted">La persona dueña de la cuenta puede conectarla.</p>}
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">Datos fiscales y reseñas en Google</h2>
          <p className="mb-4 text-sm text-text-muted">Salen en los recibos de tus viajeros y en el informe anual. Con el enlace de Google, pedimos reseña allí a quien te pone 4 o 5 estrellas.</p>
          <FiscalForm f={fis} />
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">WhatsApp y clientes que repiten</h2>
          <p className="mb-3 text-sm text-text-muted">Con WhatsApp Business conectado, los mensajes de tus viajeros llegan a Mensajes y contestas desde ahí; las preguntas frecuentes se responden solas con los datos de tus tours.{!whatsappOn() && " La conexión con WhatsApp todavía no está activada en este servidor."}</p>
          <CommsForm phoneId={comms.whatsappPhoneId} autoReply={comms.whatsappAutoReply} loyalty={comms.loyaltyPercent} />
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">Insignia de guía verificado</h2>
          <p className="mb-3 text-sm text-text-muted">Los viajeros reservan más con quien tiene la identidad y la acreditación comprobadas. La insignia sale en tu página pública.</p>
          {s.company.verificationStatus === "verified" ? <p className="text-sm font-semibold text-success">✓ Verificado</p>
            : s.company.verificationStatus === "pending" ? <p className="text-sm">Lo estamos revisando. Te avisamos por correo.</p>
            : owner ? <>{s.company.verificationStatus === "rejected" && <p className="mb-2 text-sm text-danger">No pudimos verificar los documentos anteriores. Vuelve a enviarlos.</p>}<VerifyForm /></>
            : <p className="text-sm text-text-muted">La persona dueña de la cuenta puede pedirla.</p>}
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">Resumen semanal</h2>
          <p className="mb-3 text-sm text-text-muted">Cada lunes por la mañana, la semana en números a tu correo: personas, ventas, propinas, tu mejor tour y las reseñas nuevas.</p>
          <form action={weeklySummaryAction} className="mb-4"><input type="hidden" name="on" value={summaryOn ? "0" : "1"} />
            <Button variant="secondary">{summaryOn ? "Dejar de recibirlo" : "Recibirlo cada lunes"}</Button></form>
          <details className="text-sm"><summary className="cursor-pointer font-semibold text-accent">Ver cómo se vería hoy</summary>
            <div className="mt-2 rounded-md bg-surface p-4"><p className="mb-2 font-semibold">{preview.subject}</p><pre className="whitespace-pre-wrap font-sans">{preview.text}</pre></div></details>
        </Card>
        <Card>
          <h2 className="mb-1 text-lg">Tu cuenta</h2>
          <p className="mb-4 text-sm text-text-muted">{s.member.fullName} · {s.member.email ?? s.member.phone}</p>
          <form action={signOutEverywhereAction} className="mb-6">
            <Button variant="secondary">Cerrar sesión en todos los dispositivos</Button>
          </form>
          <DeleteAccountForm isOwner={owner} />
        </Card>
      </div>
    </>
  );
}
