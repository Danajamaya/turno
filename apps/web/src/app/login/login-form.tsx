"use client";
import { loginAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} className="grid gap-4">
      {(s) => (
        <>
          <Field label="Tu correo" name="email" type="email" required autoComplete="email" defaultValue={s.fields?.email} />
          <Submit size="lg">Mandarme el enlace</Submit>
        </>
      )}
    </ActionForm>
  );
}
