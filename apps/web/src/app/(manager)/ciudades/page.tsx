import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { cityReport } from "@/lib/cities";
import { money } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { CityForm } from "./city-form";

export const metadata: Metadata = { title: "Ciudades" };
export const dynamic = "force-dynamic";

// For agencies in several cities: this month city by city.
export default async function CitiesPage() {
  const s = await requireSession(["owner", "manager"]);
  const now = new Date(), from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const rows = await cityReport(s, from, to);
  const cur = s.company.currency;
  return (
    <>
      <PageHeader title="Ciudades" />
      <p className="-mt-4 mb-5 max-w-2xl text-sm text-text-muted">Este mes, ciudad por ciudad. Cada tour pertenece a una ciudad (elígela al editar el tour), con su hora local, sus guías y sus precios.</p>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.locationId} className="p-5">
            <h2 className="font-serif text-lg">{r.city}</h2>
            <p className="tnum font-serif text-xl">{money(r.netCents, cur)}</p>
            <p className="tnum text-sm text-text-muted">{r.people} personas en {r.bookings} reservas · {r.tours} tours · {r.guides} guías · propinas {money(r.tipsCents, cur)}</p>
          </Card>
        ))}
      </div>
      {s.member.role === "owner" && (
        <Card className="max-w-xl p-5">
          <h2 className="mb-1 text-lg">Añadir una ciudad</h2>
          <p className="mb-3 text-sm text-text-muted">Para trabajar en otra ciudad con sus propios tours y guías. Disponible en el plan Agencia.</p>
          <CityForm />
        </Card>
      )}
    </>
  );
}
