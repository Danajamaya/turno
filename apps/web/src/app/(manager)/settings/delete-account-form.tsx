"use client";
import { deleteAccountAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

export function DeleteAccountForm({ isOwner }: { isOwner: boolean }) {
  return (
    <ActionForm action={deleteAccountAction} className="grid gap-3 border-t border-border pt-4">
      {() => (
        <>
          <h3 className="font-semibold">Borrar mi cuenta</h3>
          <p className="text-sm text-text-muted">
            {isOwner ? "Como dueño, primero tienes que cerrar el negocio o pasarlo a otra persona." : "Se borran tus datos de acceso. Las horas que trabajaste se quedan con el negocio porque son registros de nómina."}
          </p>
          <Field label="Escribe BORRAR para confirmar" name="confirm" autoComplete="off" />
          <Submit variant="danger">Borrar mi cuenta</Submit>
        </>
      )}
    </ActionForm>
  );
}
