"use client";
import Link from "next/link";
import { saveProfileAction, saveTourAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Select } from "@/components/ui";
import type { Profile, Tour } from "@/lib/marketplace";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const area = "w-full rounded-md border border-border-input bg-bg px-3 py-2 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus";

export function ProfileForm({ profile, suggested }: { profile: Profile | null; suggested: string }) {
  return (
    <ActionForm action={saveProfileAction} className="grid gap-4">
      {() => (
        <>
          <Field label="Dirección de tu página" name="slug" required defaultValue={profile?.slug ?? suggested} help="turno.app/g/tu-direccion · letras sin acentos, números y guiones" />
          <Field label="Frase de presentación" name="headline" maxLength={120} defaultValue={profile?.headline} placeholder="Historiadora del arte y madrileña de toda la vida" />
          <div><label htmlFor="bio" className="mb-1 block text-sm font-semibold">Sobre ti</label><textarea id="bio" name="bio" rows={5} maxLength={2000} defaultValue={profile?.bio} className={area} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ciudad" name="city" defaultValue={profile?.city} />
            <Field label="Idiomas" name="languages" defaultValue={profile?.languages.join(", ")} help="Separados por comas" />
          </div>
          <Field label="Especialidades" name="specialities" defaultValue={profile?.specialities.join(", ")} help="Historia, gastronomía, familias…" />
          <Field label="Video de presentación (YouTube o Vimeo)" name="videoUrl" type="url" defaultValue={profile?.videoUrl ?? ""} help="60 segundos bastan: los perfiles con video reciben más reservas" />
          <fieldset className="grid gap-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-semibold">Turismo sostenible</legend>
            <p className="text-xs text-text-muted">Con la primera marcada y grupos de 15 personas o menos, tu página muestra el sello y aparece en el filtro «Sostenible».</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sustainableLocal" defaultChecked={profile?.sustainableLocal} className="h-5 w-5" /> Recomiendo comercios y bares locales, no cadenas</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sustainableNoPlastic" defaultChecked={profile?.sustainableNoPlastic} className="h-5 w-5" /> Sin plástico de un solo uso (auriculares y bandera reutilizables)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sustainablePublicTransport" defaultChecked={profile?.sustainablePublicTransport} className="h-5 w-5" /> Nos movemos a pie o en transporte público</label>
          </fieldset>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="published" defaultChecked={profile?.published} className="h-5 w-5" /> Publicar mi página</label>
          <Submit>Guardar perfil</Submit>
        </>
      )}
    </ActionForm>
  );
}

export function TourForm({ tour, currency, locations = [] }: { tour?: Tour; currency: string; locations?: { id: string; name: string }[] }) {
  const slot = (d: number) => tour?.weeklySlots.filter((x) => x.weekday === d).map((x) => x.time).join(", ") ?? "";
  return (
    <ActionForm action={saveTourAction} className="grid gap-4">
      {() => (
        <>
          {tour && <input type="hidden" name="id" value={tour.id} />}
          <Field label="Nombre" name="title" required maxLength={120} defaultValue={tour?.title} placeholder="Free tour Madrid de los Austrias" />
          <div><label htmlFor="description" className="mb-1 block text-sm font-semibold">Descripción</label><textarea id="description" name="description" rows={3} maxLength={1000} defaultValue={tour?.description ?? ""} className={area} /></div>
          <Field label="Punto de encuentro" name="meetingPoint" defaultValue={tour?.meetingPoint ?? ""} placeholder="Plaza Mayor, junto a la estatua" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Precio" name="priceModel" defaultValue={tour?.priceModel ?? "free_tip"}>
              <option value="free_tip">A la voluntad (free tour)</option>
              <option value="per_person">Por persona</option>
              <option value="per_group">Por grupo (privado o paquete)</option>
            </Select>
            <Field label={`Importe (${currency})`} name="price" inputMode="decimal" defaultValue={tour && tour.priceCents ? (tour.priceCents / 100).toFixed(2) : ""} help="Vacío si es a la voluntad" />
            <Field label="Duración (min)" name="durationMin" type="number" min="15" defaultValue={tour?.durationMin ?? 120} />
            <Field label="Plazas por salida" name="capacity" type="number" min="1" defaultValue={tour?.capacity ?? 20} />
            <Field label="Máximo por reserva" name="maxPeople" type="number" min="1" defaultValue={tour?.maxPeoplePerBooking ?? 10} />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold">Horarios cada semana <span className="font-normal text-text-muted">(por ejemplo 10:30, 17:00)</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm"><span className="w-24">{DAYS[d]}</span>
                  <input name={`slot-${d}`} defaultValue={slot(d)} placeholder="—" className="h-9 min-w-0 flex-1 rounded-md border border-border-input bg-bg px-2" /></label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Señal por persona (${currency})`} name="deposit" inputMode="decimal" defaultValue={tour?.depositCents ? (tour.depositCents / 100).toFixed(2) : ""} help="Se paga al reservar; el resto en el punto de encuentro. Vacío: todo en el punto." />
            <Field label={`Cargo si no se presenta (${currency})`} name="noShowFee" inputMode="decimal" defaultValue={tour?.noShowFeeCents ? (tour.noShowFeeCents / 100).toFixed(2) : ""} help="Solo tours a la voluntad. Se guarda la tarjeta y se cobra si marcas «no vino»." />
          </div>
          <div><label htmlFor="stops" className="mb-1 block text-sm font-semibold">Paradas del recorrido</label>
            <textarea id="stops" name="stops" rows={4} defaultValue={(tour?.stops ?? []).map((x) => x.lat !== null ? `${x.name} | ${x.lat}, ${x.lng}` : x.name).join("\n")} placeholder={"Plaza Mayor | 40.4155, -3.7074\nMercado de San Miguel\nPalacio Real | 40.4179, -3.7143"} className={area} aria-describedby="stops-help" />
            <p id="stops-help" className="mt-1 text-xs text-text-muted">Una por línea. Las coordenadas son opcionales (en Google Maps: clic derecho en el sitio y copiar).</p></div>
          <Field label="Qué incluye (para paquetes combinados)" name="includes" defaultValue={(tour?.includes ?? []).join(", ")} placeholder="Entrada al Prado, 2 tapas y bebida, transporte" help="Separado por comas. Sale en tu página como «Incluye»." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Seguro de viaje opcional por persona (${currency})`} name="insurance" inputMode="decimal" defaultValue={tour?.insuranceCents ? (tour.insuranceCents / 100).toFixed(2) : ""} help="El viajero puede añadirlo al reservar. Vacío: no se ofrece." />
            {locations.length > 1 && <div><label htmlFor="locationId" className="mb-1 block text-sm font-semibold">Ciudad</label>
              <select id="locationId" name="locationId" defaultValue={tour?.locationId ?? ""} className="h-10 w-full rounded-md border border-border-input bg-bg px-3">{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
          </div>
          <div><label htmlFor="script" className="mb-1 block text-sm font-semibold">Guion para los guías</label>
            <textarea id="script" name="script" rows={5} maxLength={20000} defaultValue={tour?.script ?? ""} placeholder={"Plaza Mayor: historia de los incendios, la estatua de Felipe III…\nMercado de San Miguel: …"} className={area} aria-describedby="script-help" />
            <p id="script-help" className="mt-1 text-xs text-text-muted">Lo que se cuenta en cada parada. Los guías lo ven en su app; sirve para formar a los nuevos.</p></div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="requiresTraining" defaultChecked={tour?.requiresTraining} className="h-5 w-5" /> Solo pueden llevarlo guías formados en este tour</label>
          <Field label="Material que hay que llevar" name="equipment" defaultValue={(tour?.equipment ?? []).join(", ")} placeholder="Bandera, auriculares, entradas del museo" help="Separado por comas. El guía lo marca antes de salir." />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="published" defaultChecked={tour?.published ?? true} className="h-5 w-5" /> Publicado en mi página</label>
          <div className="flex gap-3"><Submit>Guardar tour</Submit><Link href="/perfil" className="inline-flex h-10 items-center px-4 text-sm font-semibold">Cancelar</Link></div>
        </>
      )}
    </ActionForm>
  );
}
