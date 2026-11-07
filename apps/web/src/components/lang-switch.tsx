import Link from "next/link";
import type { Lang } from "@/lib/i18n-dict";

/** ES | EN links that keep the current page and its filters. */
export function LangSwitch({ lang, path, params = {} }: { lang: Lang; path: string; params?: Record<string, string | undefined> }) {
  const href = (l: Lang) => `${path}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), lang: l } as Record<string, string>)}`;
  return (
    <nav aria-label="Idioma / Language" className="flex gap-1 text-sm font-semibold">
      {(["es", "en"] as const).map((l) => <Link key={l} href={href(l)} aria-current={l === lang ? "true" : undefined} className={`rounded-md px-2 py-1 ${l === lang ? "bg-on-side text-side-a" : "text-side-text hover:text-on-side"}`}>{l.toUpperCase()}</Link>)}
    </nav>
  );
}
