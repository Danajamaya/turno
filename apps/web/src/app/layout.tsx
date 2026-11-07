import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/pwa";

export const metadata: Metadata = { title: { default: "Turno", template: "%s · Turno" }, description: "Tus tours, reservas y equipo en un solo lugar.", appleWebApp: { capable: true, title: "Turno", statusBarStyle: "default" }, icons: { apple: "/pwa-icon/192" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14224a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Outfit:wght@400;500;600;700&display=swap" />
      </head>
      <body className="min-h-screen bg-surface text-text antialiased">{children}<RegisterServiceWorker /></body>
    </html>
  );
}
