import { Globe } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { Nav } from "@/components/nav";
import { requireSession } from "@/lib/session";

// AppShell in the owner's CRM style: gradient sidebar, gold rule under the top bar.
export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession(["owner", "manager"]);
  const initials = s.member.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="min-h-screen md:flex">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-md focus:bg-bg focus:p-2">Saltar al contenido</a>
      <aside className="bg-gradient-to-b from-side-a to-side-b p-3 text-side-text md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:overflow-y-auto">
        <div className="mb-2 flex items-center gap-3 border-b border-side-line px-2 pb-4 pt-1">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-gold to-ch-strawberry text-on-side"><Globe aria-hidden size={20} /></span>
          <span className="min-w-0">
            <span className="block font-serif text-lg font-bold tracking-wide text-on-side">TURNO</span>
            <span className="block truncate text-xs uppercase tracking-wider text-side-muted">{s.company.name}</span>
          </span>
        </div>
        <Nav />
        <form action={signOutAction} className="mt-auto hidden items-center gap-3 border-t border-side-line px-2 pt-4 md:flex">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-ch-strawberry text-sm font-bold text-side-a">{initials}</span>
          <span className="min-w-0 text-sm">
            <span className="block truncate font-semibold text-on-side">{s.member.fullName}</span>
            <button className="text-xs text-side-text underline hover:text-on-side">Salir</button>
          </span>
        </form>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="h-1 bg-gold" aria-hidden />
        <main id="contenido" className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
