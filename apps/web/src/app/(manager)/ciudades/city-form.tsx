"use client";
import { addCityAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field } from "@/components/ui";

const ZONES = [["Europe/Madrid", "España (península)"], ["Atlantic/Canary", "Canarias"], ["Europe/Lisbon", "Portugal"], ["Europe/Paris", "Francia"], ["Europe/Rome", "Italia"], ["Europe/Berlin", "Alemania"], ["Europe/London", "Reino Unido"]];

export function CityForm() {
  return (
    <ActionForm action={addCityAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" resetOnOk>
      {() => (
        <>
          <Field label="Ciudad" name="name" id="city-name" required placeholder="Sevilla" />
          <div><label htmlFor="city-tz" className="mb-1 block text-sm font-semibold">Zona horaria</label>
            <select id="city-tz" name="timezone" className="h-10 w-full rounded-md border border-border-input bg-bg px-3">{ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <Submit variant="secondary">Añadir</Submit>
        </>
      )}
    </ActionForm>
  );
}
