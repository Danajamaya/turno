"use client";
import { createApiKeyAction, importCsvAction } from "@/app/pro-actions";
import { ActionForm, Submit } from "@/components/forms";
import { Banner, Field } from "@/components/ui";

const PLATFORMS = [["guruwalk", "GuruWalk"], ["freetour", "Freetour.com"], ["strawberry", "Strawberry Tours"], ["getyourguide", "GetYourGuide"], ["viator", "Viator"], ["civitatis", "Civitatis"], ["other", "Otra"]];

export function ImportForm({ template }: { template: string }) {
  return (
    <ActionForm action={importCsvAction} className="grid gap-3">
      {() => (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Archivo CSV<input type="file" name="file" accept=".csv,text/csv" required className="mt-1 block w-full text-sm" /></label>
            <div><label htmlFor="imp-platform" className="mb-1 block text-sm font-semibold">Si no dice la plataforma, usar</label>
              <select id="imp-platform" name="platform" className="h-10 w-full rounded-md border border-border-input bg-bg px-3">{PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <p className="text-xs text-text-muted">Columnas: fecha, hora, tour, personas, plataforma, nombre, email, teléfono, referencia, importe, estado. <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="plantilla-reservas.csv" className="font-semibold text-accent underline">Descargar plantilla</a></p>
          <div><Submit variant="secondary">Importar</Submit></div>
        </>
      )}
    </ActionForm>
  );
}

export function ApiKeyForm({ base }: { base: string }) {
  return (
    <ActionForm action={createApiKeyAction} className="grid gap-3">
      {(s) => (
        <>
          {s.ok && <Banner tone="warning" role="alert">Copia la clave ahora; no se vuelve a mostrar: <code className="break-all font-mono text-xs">{s.ok}</code></Banner>}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div><label htmlFor="key-platform" className="mb-1 block text-sm font-semibold">Plataforma</label>
              <select id="key-platform" name="platform" className="h-10 w-full rounded-md border border-border-input bg-bg px-3">{[["getyourguide", "GetYourGuide"], ["viator", "Viator"], ["civitatis", "Civitatis"], ["other", "Otra"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <Field label="Nombre" name="label" id="key-label" placeholder="Viator producción" />
            <Submit variant="secondary">Crear clave</Submit>
          </div>
          <p className="text-xs text-text-muted">Dirección de la API: <code className="font-mono">{base}/api/octo</code></p>
        </>
      )}
    </ActionForm>
  );
}
