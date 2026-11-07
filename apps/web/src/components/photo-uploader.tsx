"use client";
import { ImagePlus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { deletePhotoAction, uploadPhotoAction } from "@/app/growth-actions";
import { Banner } from "./ui";

// Resize in the browser (longest side 1600 px, JPEG) so phone photos upload fast and fit the 2 MB limit.
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("resize"))), "image/jpeg", 0.85));
}

export function PhotoUploader({ kind, ownerId, photos, label }: { kind: "profile" | "tour"; ownerId: string; photos: string[]; label: string }) {
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [busy, start] = useTransition();
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    start(async () => {
      try {
        const fd = new FormData();
        fd.append("photo", new File([await shrink(file)], "photo.jpg", { type: "image/jpeg" }));
        fd.append("kind", kind); fd.append("ownerId", ownerId);
        setMsg(await uploadPhotoAction({}, fd));
      } catch { setMsg({ error: "No pudimos leer esa foto. Prueba con otra." }); }
    });
  };
  return (
    <div className="grid gap-2">
      {msg.error && <Banner tone="danger" role="alert">{msg.error}</Banner>}
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {photos.map((id, i) => (
          <li key={id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/media/${id}`} alt={i === 0 ? `${label}: portada` : `${label} ${i + 1}`} className="h-20 w-28 rounded-md object-cover" />
            <form action={deletePhotoAction} className="absolute right-1 top-1"><input type="hidden" name="id" value={id} />
              <button aria-label={`Borrar foto ${i + 1}`} className="grid h-7 w-7 place-items-center rounded-pill bg-bg shadow-card"><Trash2 aria-hidden size={14} /></button></form>
          </li>
        ))}
        <li>
          <label className={`grid h-20 w-28 cursor-pointer place-items-center rounded-md border border-dashed border-border-input text-xs font-semibold text-text-muted hover:border-text ${busy ? "opacity-60" : ""}`}>
            <span className="grid place-items-center gap-1"><ImagePlus aria-hidden size={20} />{busy ? "Subiendo…" : "Añadir foto"}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={onPick} disabled={busy} aria-label={`Añadir foto a ${label}`} />
          </label>
        </li>
      </ul>
    </div>
  );
}
