"use client";
import type { FormState } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";

export function TravellerReply({ action, token, en }: { action: (s: FormState, f: FormData) => Promise<FormState>; token: string; en: boolean }) {
  return (
    <ActionForm action={action} className="grid gap-2" resetOnOk>
      {() => (
        <>
          <input type="hidden" name="token" value={token} /><input type="hidden" name="lang" value={en ? "en" : "es"} />
          <label htmlFor="treply" className="text-sm font-semibold">{en ? "Reply" : "Responder"}</label>
          <textarea id="treply" name="body" rows={3} required maxLength={4000} className="w-full rounded-md border border-border-input bg-bg px-3 py-2" />
          <Submit>{en ? "Send" : "Enviar"}</Submit>
        </>
      )}
    </ActionForm>
  );
}
