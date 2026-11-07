// Transactional email through Resend's HTTP API. Without RESEND_API_KEY
// (development and tests) messages go to .data/outbox.jsonl instead.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface Email { to: string; subject: string; text: string }

export async function sendEmail(msg: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const file = path.join(process.cwd(), ".data", "outbox.jsonl");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify({ ...msg, at: new Date().toISOString() }) + "\n");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Turno <hola@example.com>", to: [msg.to], subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status}`);
}

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
