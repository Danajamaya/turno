import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { deleteTourAction } from "@/app/actions";
import { Badge, Banner, Button, Card, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { getProfile, listTours } from "@/lib/marketplace";
import { photosFor } from "@/lib/media";
import { giftCards } from "@/lib/gifts";
import { PhotoUploader } from "@/components/photo-uploader";
import { markGiftPaidAction } from "@/app/growth-actions";
import { requireSession } from "@/lib/session";
import { ProfileForm, TourForm } from "./forms";

export const metadata: Metadata = { title: "Perfil y paquetes" };
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

// The business's public page and the tours and packages it sells on Turno.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ editar?: string; nuevo?: string; guardado?: string }> }) {
  const s = await requireSession(["owner", "manager"]);
  const q = await searchParams;
  const [profile, tours, gifts] = await Promise.all([getProfile(s), listTours(s), giftCards(s)]);
  const photos = await photosFor([s.company.id, ...tours.map((t) => t.id)]);
  const editing = q.editar ? tours.find((t) => t.id === q.editar) : undefined;
  const suggested = s.company.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const price = (t: (typeof tours)[number]) => t.priceModel === "free_tip" ? "A la voluntad" : `${money(t.priceCents, t.currency)} ${t.priceModel === "per_person" ? "por persona" : "por grupo"}`;
  return (
    <>
      <PageHeader title="Perfil y paquetes">
        {profile?.published && <Link href={`/g/${profile.slug}`} target="_blank" className="inline-flex items-center gap-2 text-sm font-semibold text-accent underline">Ver mi página pública <ExternalLink aria-hidden size={14} /></Link>}
      </PageHeader>
      {q.guardado && <div className="mb-4"><Banner tone="success" role="status">Tour guardado.</Banner></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="mb-1 font-serif text-lg">Tu perfil público</h2>
          <p className="mb-4 text-sm text-text-muted">Lo que ven los viajeros antes de reservar, como un perfil de Preply.</p>
          <ProfileForm profile={profile} suggested={suggested || "mi-tour"} />
          <h3 className="mb-1 mt-6 font-semibold">Tus fotos</h3>
          <p className="mb-3 text-sm text-text-muted">La primera es la de tu perfil. Fotos tuyas guiando a un grupo funcionan mejor que paisajes.</p>
          <PhotoUploader kind="profile" ownerId={s.company.id} photos={photos.get(s.company.id) ?? []} label="Fotos del perfil" />
        </Card>
        <div className="grid content-start gap-6">
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-3"><h2 className="mr-auto font-serif text-lg">Tours y paquetes</h2><Link href="/perfil?nuevo=1" className="text-sm font-semibold text-accent underline">+ Nuevo tour</Link></div>
            {tours.length === 0 ? <p className="text-sm text-text-muted">Todavía no tienes tours. Crea el primero: un free tour, un tour privado o un paquete familiar.</p> : (
              <ul className="divide-y divide-border">
                {tours.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{t.title}</span>
                      <span className="block text-xs text-text-muted">{price(t)} · {t.durationMin} min · hasta {t.capacity} · {t.weeklySlots.length ? t.weeklySlots.map((x) => `${DAYS[x.weekday]} ${x.time}`).join(", ") : "sin horarios"}</span>
                    </span>
                    <span className="w-full"><PhotoUploader kind="tour" ownerId={t.id} photos={photos.get(t.id) ?? []} label={`Fotos de ${t.title}`} /></span>
                    {t.published ? <Badge tone="approved">Publicado</Badge> : <Badge>Borrador</Badge>}
                    <Link href={`/perfil?editar=${t.id}`} className="font-semibold text-accent underline">Editar</Link>
                    <form action={deleteTourAction}><input type="hidden" name="id" value={t.id} /><Button size="sm" variant="ghost" aria-label={`Borrar ${t.title}`}>Borrar</Button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="mb-1 font-serif text-lg">Tarjetas regalo</h2>
            <p className="mb-3 text-sm text-text-muted">Se venden desde tu página pública. Si vendes una en mano, márcala como cobrada para activarla.</p>
            {gifts.length === 0 ? <p className="text-sm text-text-muted">Todavía no vendiste ninguna.</p> : (
              <ul className="divide-y divide-border text-sm">
                {gifts.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1"><b className="tnum">{g.code}</b><span className="block text-xs text-text-muted">De {g.buyerName} para {g.recipientName}</span></span>
                    <span className="tnum">{money(g.balanceCents, g.currency)} de {money(g.amountCents, g.currency)}</span>
                    {g.status === "pending" ? <form action={markGiftPaidAction}><input type="hidden" name="id" value={g.id} /><Button size="sm" variant="secondary">Marcar cobrada</Button></form>
                      : <Badge tone={g.status === "active" ? "approved" : undefined}>{g.status === "active" ? "Activa" : g.status === "used" ? "Usada" : "Anulada"}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(q.nuevo || editing) && (
            <Card>
              <h2 className="mb-4 font-serif text-lg">{editing ? `Editar «${editing.title}»` : "Nuevo tour o paquete"}</h2>
              <TourForm tour={editing} currency={s.company.currency} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
