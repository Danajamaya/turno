"use client";
export function PrintButton({ label }: { label: string }) {
  return <button type="button" onClick={() => window.print()} className="mt-8 rounded-md border border-border-input px-4 py-2 text-sm font-semibold print:hidden">{label}</button>;
}
