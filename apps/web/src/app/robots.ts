import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/email";

// Only the traveller pages are for search engines; the CRM, private links and the API are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/guias", "/tours/", "/g/"], disallow: ["/api/", "/resena/", "/consulta/", "/propina/", "/embed/", "/g/*/reserva/"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
