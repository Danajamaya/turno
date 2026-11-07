import { decideVerificationAction } from "@/app/pro-actions";

export function VerifyButtons({ companyId }: { companyId: string }) {
  return (
    <form action={decideVerificationAction} className="flex gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <button name="approve" value="1" className="rounded-md bg-success px-3 py-1.5 text-sm font-semibold text-on-accent">Verificar</button>
      <button name="approve" value="0" className="rounded-md border border-border-input px-3 py-1.5 text-sm font-semibold">Rechazar</button>
    </form>
  );
}
