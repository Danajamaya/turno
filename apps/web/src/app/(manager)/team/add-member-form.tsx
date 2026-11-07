"use client";
import { addMemberAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Select } from "@/components/ui";

// S02 add a person; the form resets after each success so several can be added in a row.
export function AddMemberForm() {
  return (
    <ActionForm action={addMemberAction} className="grid gap-4" resetOnOk>
      {(st) => (
        <>
          <Field label="Nombre completo" name="fullName" required autoComplete="off" defaultValue={st.fields?.fullName} />
          <Field label="Celular" name="phone" type="tel" inputMode="tel" autoComplete="off" help="Le mandamos la invitación por mensaje." defaultValue={st.fields?.phone} />
          <Field label="Correo (opcional)" name="email" type="email" autoComplete="off" defaultValue={st.fields?.email} />
          <Field label="Puesto" name="jobTitle" placeholder="Cocinero, mesero, cajero…" defaultValue={st.fields?.jobTitle} />
          <Field label="Sueldo por hora (USD)" name="wage" type="number" min="0" step="0.01" inputMode="decimal" className="tnum" defaultValue={st.fields?.wage} />
          <Select label="Permisos" name="role" defaultValue={st.fields?.role ?? "employee"}>
            <option value="employee">Empleado: ve su horario y checa</option>
            <option value="manager">Gerente: arma horarios y aprueba horas</option>
          </Select>
          <Submit>Agregar e invitar</Submit>
        </>
      )}
    </ActionForm>
  );
}
