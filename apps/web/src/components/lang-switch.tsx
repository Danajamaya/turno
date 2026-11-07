import Link from "next/link";
import type { Lang } from "@/lib/i18n-dict";

/** ES | EN links that keep the current page and its filters. `tone` matches the header it sits on. */
export function LangSwitch({ lang, path, params = {}, tone = "dark" }: { lang: Lang; path: string; params?: Record<string, string | undefined>; tone?: "dark" | "light" }) {
  const href = (l: Lang) => `${path}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), lang: l } as Record<string, string>)}`;
  const on = tone === "dark" ? "bg-on-side text-side-a" : "bg-text text-bg";
  const off = tone === "dark" ? "text-side-text hover:text-on-side" : "text-text-muted hover:bg-surface hover:text-text";
  return (
    <nav aria-label="Idioma / Language" className="flex gap-1 text-sm font-semibold">
      {(["es", "en"] as const).map((l) => <Link key={l} href={href(l)} aria-current={l === lang ? "true" : undefined} className={`rounded-pill px-3 py-1.5 ${l === lang ? on : off}`}>{l.toUpperCase()}</Link>)}
    </nav>
  );
}
