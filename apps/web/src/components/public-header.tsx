import Link from "next/link";
import { Globe } from "lucide-react";
import type { ReactNode } from "react";
import { LangSwitch } from "@/components/lang-switch";
import type { Lang } from "@/lib/i18n-dict";

/** The white top bar of the traveller pages: logo, an optional slot (search), language. */
export function PublicHeader({ lang, path, params, children }: { lang: Lang; path: string; params?: Record<string, string | undefined>; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg">
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
        <Link href={`/guias?lang=${lang}`} className="flex items-center gap-2" aria-label="Turno">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-gold to-ch-strawberry text-on-side"><Globe aria-hidden size={18} /></span>
          <span className="font-serif text-lg font-bold text-side-a">turno</span>
        </Link>
        <div className="order-3 w-full md:order-none md:w-auto md:flex-1">{children}</div>
        <div className="ml-auto md:ml-0"><LangSwitch lang={lang} path={path} params={params} tone="light" /></div>
      </div>
    </header>
  );
}
