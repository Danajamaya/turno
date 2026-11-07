"use client";
import { signupAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Select } from "@/components/ui";

export function SignupForm({ zones, referral }: { zones: string[][]; referral?: string }) {
  return (
    <ActionForm action={signupAction} className="grid gap-4">
      {(s) => (
        <>
          {referral && <input type="hidden" name="ref" value={referral} />}
          <Field label="Nombre del negocio" name="companyName" required autoComplete="organization" defaultValue={s.fields?.companyName} />
          <Field label="Giro (opcional)" name="industry" placeholder="Restaurante, tienda, salón…" defaultValue={s.fields?.industry} />
          <Field label="Nombre del local" name="locationName" required help="Si tienes varios, empieza con uno." defaultValue={s.fields?.locationName ?? "Principal"} />
          <Select label="Zona horaria del local" name="timezone" defaultValue={s.fields?.timezone ?? "America/Chicago"}>
            {zones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Field label="Tu nombre" name="ownerName" required autoComplete="name" defaultValue={s.fields?.ownerName} />
          <Field label="Tu correo" name="ownerEmail" type="email" required autoComplete="email" defaultValue={s.fields?.ownerEmail} />
          <Submit size="lg">Crear mi cuenta</Submit>
        </>
      )}
    </ActionForm>
  );
}
