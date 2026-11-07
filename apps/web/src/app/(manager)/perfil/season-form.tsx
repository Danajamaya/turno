"use client";
import { saveSeasonAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

export function SeasonForm({ tours }: { tours: { id: string; title: string }[] }) {
  return (
    <ActionForm action={saveSeasonAction} className="grid gap-3 sm:grid-cols-2" resetOnOk>
      {() => (
        <>
          <Field label="Nombre de la temporada" name="name" id="se-name" required placeholder="Semana Santa" />
          <div><label htmlFor="se-tour" className="mb-1 block text-sm font-semibold">Tour</label>
            <select id="se-tour" name="tourId" className="h-10 w-full rounded-md border border-border-input bg-bg px-3"><option value="">Todos los tours con precio</option>{tours.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
          <Field label="Desde" name="startsOn" id="se-from" type="date" required />
          <Field label="Hasta" name="endsOn" id="se-to" type="date" required />
          <Field label="Variación (%)" name="percent" id="se-pct" type="number" min="-90" max="300" required placeholder="20" help="Positivo para subir (temporada alta), negativo para bajar (temporada baja)." />
          <div className="self-end"><Submit variant="secondary">Añadir temporada</Submit></div>
        </>
      )}
    </ActionForm>
  );
}
