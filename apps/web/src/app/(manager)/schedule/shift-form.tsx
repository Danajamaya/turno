"use client";
import { createShiftAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { ButtonLink, Field, Select } from "@/components/ui";
import type { Member } from "@/lib/types";

// S06 shift editor. An end time earlier than the start means it ends the next day.
export function ShiftForm({ week, date, memberId, people, defaultRole, cancelHref }: {
  week: string; date: string; memberId: string; people: Member[]; defaultRole: string; cancelHref: string;
}) {
  return (
    <ActionForm action={createShiftAction} className="grid gap-4">
      {(s) => (
        <>
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="date" value={date} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Select label="Persona" name="memberId" defaultValue={s.fields?.memberId ?? memberId}>
              <option value="">Turno abierto</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </Select>
            <Field label="Entrada" name="start" type="time" step={900} required defaultValue={s.fields?.start ?? "09:00"} />
            <Field label="Salida" name="end" type="time" step={900} required defaultValue={s.fields?.end ?? "17:00"} help="Si es antes de la entrada, termina al día siguiente." />
            <Field label="Puesto" name="jobTitle" defaultValue={s.fields?.jobTitle ?? defaultRole} />
            <Field label="Descanso sin goce (min)" name="breakMin" type="number" min="0" step="5" inputMode="numeric" defaultValue={s.fields?.breakMin ?? "30"} />
          </div>
          <Field label="Nota (opcional)" name="note" defaultValue={s.fields?.note} />
          <div className="flex gap-3">
            <Submit>Guardar turno</Submit>
            <ButtonLink href={cancelHref} variant="ghost">Cancelar</ButtonLink>
          </div>
        </>
      )}
    </ActionForm>
  );
}
