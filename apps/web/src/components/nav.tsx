"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarRange, ClipboardCheck, Euro, Inbox, Plug, Settings, Users } from "lucide-react";

const items = [
  { href: "/calendario", label: "Calendario", icon: CalendarRange },
  { href: "/canales", label: "Plataformas", icon: Plug },
  { href: "/ingresos", label: "Ingresos", icon: Euro },
  { href: "/schedule", label: "Horario", icon: CalendarDays },
  { href: "/team", label: "Equipo", icon: Users },
  { href: "/requests", label: "Solicitudes", icon: Inbox },
  { href: "/timesheets", label: "Hojas de horas", icon: ClipboardCheck },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const current = path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}
            className={`flex min-h-tap shrink-0 items-center gap-3 rounded-md px-3 text-sm font-semibold ${current ? "bg-accent-soft text-accent" : "text-text hover:bg-surface"}`}>
            <Icon aria-hidden size={18} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
