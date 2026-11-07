// Primitives from replica/design/components.md, styled only with token classes.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover border-transparent",
  secondary: "bg-bg text-text border-border-input hover:bg-surface",
  ghost: "bg-transparent text-text border-transparent hover:bg-surface",
  danger: "bg-danger text-on-danger border-transparent",
};
const sizes = { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-5" };
const base = "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest} />;
}

export function ButtonLink({ variant = "secondary", size = "md", className = "", ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest} />;
}

export function Field({ label, name, help, error, className = "", ...rest }: ComponentProps<"input"> & { label: string; name: string; help?: string; error?: string }) {
  const id = rest.id ?? name;
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      <input id={id} name={name} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
        className={`h-10 w-full rounded-md border bg-bg px-3 text-base text-text focus-visible:border-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${error ? "border-danger" : "border-border-input"}`} {...rest} />
      {error ? <p id={`${id}-error`} className="mt-1 text-xs text-danger">{error}</p>
        : help ? <p id={`${id}-help`} className="mt-1 text-xs text-text-muted">{help}</p> : null}
    </div>
  );
}

export function Select({ label, name, children, className = "", ...rest }: ComponentProps<"select"> & { label: string; name: string }) {
  const id = rest.id ?? name;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{label}</label>
      <select id={id} name={name} className="h-10 w-full rounded-md border border-border-input bg-bg px-3 text-base text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus" {...rest}>{children}</select>
    </div>
  );
}

const tones = {
  pending: "bg-warning-soft text-warning", approved: "bg-success-soft text-success", denied: "bg-danger-soft text-danger",
  invited: "bg-info-soft text-info", neutral: "bg-surface text-text-muted",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex h-5 items-center rounded-pill px-2 text-xs ${tones[tone]}`}>{children}</span>;
}

const bannerTones = { info: "bg-info-soft text-info", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" };
export function Banner({ tone = "info", children, role }: { tone?: keyof typeof bannerTones; children: ReactNode; role?: "status" | "alert" }) {
  return <div role={role} className={`flex flex-wrap items-center gap-3 rounded-md px-4 py-3 text-sm ${bannerTones[tone]}`}>{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-border bg-surface-raised p-6 shadow-card ${className}`}>{children}</section>;
}

/** Metric card with a coloured top edge, like the owner's CRMs. `edge` is a token class, e.g. "border-t-ch-viator"; `icon` sits in a tinted chip of the same colour. */
export function Kpi({ label, value, note, edge = "border-t-accent", trend, icon }: { label: string; value: string; note?: string; edge?: string; trend?: { text: string; up: boolean }; icon?: ReactNode }) {
  const colour = edge.replace("border-t-", "");
  return (
    <div className={`rounded-lg border border-t-4 border-border bg-surface-raised p-5 shadow-card ${edge}`}>
      <p className="flex items-center justify-between gap-2 text-sm font-semibold text-text-muted">{label}
        {icon && <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: `color-mix(in srgb, var(--color-${colour}) 16%, transparent)`, color: `color-mix(in srgb, var(--color-${colour}) 70%, var(--color-text))` }}>{icon}</span>}
      </p>
      <p className="tnum my-1 font-serif text-xl">{value}</p>
      {trend ? <p className="text-sm text-text-muted"><span className={`font-semibold ${trend.up ? "text-success" : "text-danger"}`}>{trend.up ? "▲" : "▼"} {trend.text}</span> vs. mismos días del mes pasado</p>
        : note ? <p className="text-sm text-text-muted">{note}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="text-lg">{title}</p>
      <p className="text-sm text-text-muted">{body}</p>
      {action}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <h1 className="mr-auto font-serif text-xl">{title}</h1>
      {children}
    </div>
  );
}
