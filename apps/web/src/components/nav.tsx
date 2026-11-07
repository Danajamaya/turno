"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarRange, ClipboardCheck, Clock, Contact, Euro, Home, Inbox, MessageCircle, MessagesSquare, Plug, Settings, Store, Tag, UserRound, Users, type LucideIcon } from "lucide-react";

// Sidebar in the style of the owner's CRMs: grouped sections, a coloured tile
// per item, a gold marker on the current page, an unread badge on the chat.
type Item = { href: string; label: string; icon: LucideIcon; tile: string; badge?: boolean };

const managerGroups: { title: string; items: Item[] }[] = [
  { title: "Principal", items: [
    { href: "/inicio", label: "Inicio", icon: Home, tile: "bg-gold" },
    { href: "/calendario", label: "Calendario", icon: CalendarRange, tile: "bg-ch-guruwalk" },
    { href: "/equipo", label: "Equipo", icon: MessagesSquare, tile: "bg-ch-viator", badge: true },
  ] },
  { title: "Viajeros", items: [
    { href: "/viajeros", label: "Viajeros", icon: Contact, tile: "bg-ch-civitatis" },
    { href: "/mensajes", label: "Mensajes", icon: MessageCircle, tile: "bg-ch-guruwalk" },
  ] },
  { title: "Negocio", items: [
    { href: "/ingresos", label: "Ingresos", icon: Euro, tile: "bg-ch-freetour" },
    { href: "/canales", label: "Plataformas", icon: Plug, tile: "bg-ch-getyourguide" },
    { href: "/perfil", label: "Perfil y paquetes", icon: Store, tile: "bg-ch-strawberry" },
  ] },
  { title: "Guías", items: [
    { href: "/team", label: "Guías", icon: Users, tile: "bg-ch-civitatis" },
    { href: "/schedule", label: "Horario", icon: CalendarDays, tile: "bg-ch-viator" },
    { href: "/requests", label: "Solicitudes", icon: Inbox, tile: "bg-ch-strawberry" },
    { href: "/timesheets", label: "Hojas de horas", icon: ClipboardCheck, tile: "bg-ch-guruwalk" },
  ] },
  { title: "Cuenta", items: [
    { href: "/planes", label: "Planes", icon: Tag, tile: "bg-gold" },
    { href: "/settings", label: "Configuración", icon: Settings, tile: "bg-side-muted" },
  ] },
];

const guideGroups: { title: string; items: Item[] }[] = [
  { title: "Principal", items: [
    { href: "/clock", label: "Mi día", icon: Clock, tile: "bg-gold" },
    { href: "/equipo", label: "Equipo", icon: MessagesSquare, tile: "bg-ch-viator", badge: true },
    { href: "/account", label: "Cuenta", icon: UserRound, tile: "bg-side-muted" },
  ] },
];

export function Nav({ manager, unread }: { manager: boolean; unread: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:block md:space-y-1">
      {(manager ? managerGroups : guideGroups).map((g) => (
        <div key={g.title} className="contents md:block">
          <p className="hidden px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-side-muted md:block">{g.title}</p>
          {g.items.map(({ href, label, icon: Icon, tile, badge }) => {
            const current = path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={current ? "page" : undefined}
                className={`relative flex min-h-tap shrink-0 items-center gap-3 rounded-md px-2 text-sm font-medium transition-colors duration-fast focus-visible:outline-gold ${current ? "bg-side-hover text-on-side" : "text-side-text hover:bg-side-hover hover:text-on-side"}`}>
                {current && <span aria-hidden className="absolute -left-3 top-2 bottom-2 hidden w-1 rounded-r-sm bg-gold md:block" />}
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${current ? `${tile} text-side-a` : "bg-side-hover text-on-side"}`}><Icon aria-hidden size={17} /></span>
                <span className="whitespace-nowrap">{label}</span>
                {badge && unread > 0 && <span className="tnum ml-auto rounded-pill bg-gold px-2 text-xs font-bold text-on-gold" aria-label={`${unread} sin leer`}>{unread}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
