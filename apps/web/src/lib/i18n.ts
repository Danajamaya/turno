// Picks the public pages' language: ?lang=, else the browser's Accept-Language.
import { headers } from "next/headers";
import type { Lang } from "./i18n-dict";

export { t, localeOf, type Lang } from "./i18n-dict";

export async function pickLang(param?: string): Promise<Lang> {
  if (param === "en" || param === "es") return param;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^\s*es\b/i.test(accept) || !/\ben\b/i.test(accept) ? "es" : "en";
}
