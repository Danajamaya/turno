"use client";
import { saveCommsAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

export function CommsForm({ phoneId, autoReply, loyalty }: { phoneId: string | null; autoReply: boolean; loyalty: number }) {
  return (
    <ActionForm action={saveCommsAction} className="grid gap-3">
      {() => (
        <>
          <Field label="Identificador del número de WhatsApp Business" name="whatsappPhoneId" inputMode="numeric" defaultValue={phoneId ?? ""} help="En Meta for Developers: WhatsApp > Configuración de la API > Phone number ID." />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="autoReply" defaultChecked={autoReply} className="h-5 w-5" /> Contestar solo las preguntas frecuentes (punto de encuentro, precio, horarios, accesibilidad)</label>
          <Field label="Descuento para quien repite (%)" name="loyaltyPercent" type="number" min="0" max="50" defaultValue={String(loyalty)} help="Se aplica solo al reservar en Turno con el mismo correo de una reserva anterior a la que vino. 0 = sin descuento." />
          <div><Submit variant="secondary">Guardar</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
