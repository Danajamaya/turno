"use client";
import { requestVerificationAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";

export function VerifyForm() {
  return (
    <ActionForm action={requestVerificationAction} className="grid gap-3">
      {() => (
        <>
          <label className="text-sm font-semibold">Documento de identidad (foto)
            <input type="file" name="doc" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-sm" /></label>
          <label className="text-sm font-semibold">Acreditación de guía oficial (foto)
            <input type="file" name="doc" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-sm" /></label>
          <p className="text-xs text-text-muted">Solo los ve el equipo de Turno para comprobarlos, y se borran al terminar.</p>
          <div><Submit variant="secondary">Enviar para verificar</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
