import type { MetadataRoute } from "next";

// Installable app: "Add to home screen" on Android and iPhone opens Turno full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Turno Guías", short_name: "Turno", description: "Tus tours, reservas y equipo en un solo lugar.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#f2f5fb", theme_color: "#14224a", lang: "es",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
