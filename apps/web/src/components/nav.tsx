"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarRange, ClipboardCheck, Euro, Home, Inbox, Plug, Settings, Users, type LucideIcon } from "lucide-react";

// Sidebar in the style of the owner's CRMs: grouped sections, a coloured tile
// per item, a gold marker on the current page.
const groups: { title: string; items: { href: string; label: string; icon: LucideIcon; tile: string }[] }[] = [
  { title: "Principal", items: [
    { href: "/inicio", label: "Inicio", icon: Home, tile: "bg-gold" },
    { href: "/calendario", label: "Calendario", icon: CalendarRange, tile: "bg-ch-guruwalk" },
  ] },
  { title: "Negocio", items: [
    { href: "/ingresos", label: "Ingresos", icon: Euro, tile: "bg-ch-freetour" },
    { href: "/canales", label: "Plataformas", icon: Plug, tile: "bg-ch-getyourguide" },
  ] },
  { title: "Equipo", items: [
    { href: "/schedule", label: "Horario", icon: CalendarDays, tile: "bg-ch-viator" },
    { href: "/team", label: "Equipo", icon: Users, tile: "bg-ch-civitatis" },
    { href: "/requests", label: "Solicitudes", icon: Inbox, tile: "bg-ch-strawberry" },
    { href: "/timesheets", label: "Hojas de horas", icon: ClipboardCheck, tile: "bg-ch-guruwalk" },
  ] },
  { title: "Cuenta", items: [{ href: "/settings", label: "Configuración", icon: Settings, tile: "bg-side-muted" }] },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:block md:space-y-1">
      {groups.map((g) => (
        <div key={g.title} className="contents md:block">
          <p className="hidden px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-side-muted md:block">{g.title}</p>
          {g.items.map(({ href, label, icon: Icon, tile }) => {
            const current = path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={current ? "page" : undefined}
                className={`relative flex min-h-tap shrink-0 items-center gap-3 rounded-md px-2 text-sm font-medium transition-colors duration-fast focus-visible:outline-gold ${current ? "bg-side-hover text-on-side" : "text-side-text hover:bg-side-hover hover:text-on-side"}`}>
                {current && <span aria-hidden className="absolute -left-3 top-2 bottom-2 hidden w-1 rounded-r-sm bg-gold md:block" />}
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${current ? `${tile} text-side-a` : "bg-side-hover text-on-side"}`}><Icon aria-hidden size={17} /></span>
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
