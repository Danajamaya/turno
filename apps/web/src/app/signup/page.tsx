import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Crea tu cuenta" };

const ZONES = [
  ["Europe/Madrid", "España (Madrid, Barcelona)"],
  ["Atlantic/Canary", "Canarias"],
  ["Europe/Lisbon", "Portugal (Lisboa)"],
  ["Europe/London", "Reino Unido (Londres)"],
  ["Europe/Paris", "Francia (París)"],
  ["Europe/Rome", "Italia (Roma)"],
  ["Europe/Berlin", "Alemania (Berlín)"],
  ["Europe/Amsterdam", "Países Bajos (Ámsterdam)"],
  ["America/New_York", "Este (Nueva York, Miami)"],
  ["America/Chicago", "Centro (Chicago, Houston)"],
  ["America/Denver", "Montaña (Denver)"],
  ["America/Phoenix", "Arizona (sin horario de verano)"],
  ["America/Los_Angeles", "Pacífico (Los Ángeles)"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawái"],
  ["America/Puerto_Rico", "Puerto Rico"],
  ["America/Mexico_City", "México (Centro)"],
];

// S01 + S02: owner account, business and first location in one step.
export default function SignupPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <p className="mb-2 text-sm font-semibold text-accent">Turno</p>
      <h1 className="mb-2 text-xl">Arma el horario de tu equipo en minutos</h1>
      <p className="mb-8 text-text-muted">Crea tu negocio, agrega a tu gente y publica la semana. Gratis para empezar.</p>
      <Card>
        <SignupForm zones={ZONES} />
      </Card>
      <p className="mt-6 text-sm text-text-muted">¿Ya tienes cuenta? <Link className="text-accent underline" href="/login">Entrar</Link></p>
    </main>
  );
}
