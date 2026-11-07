// The growth features in Chromium, on the demo data (Madrid a Pie):
// a traveller asks a question and buys a gift card, the manager answers with a
// suggested reply and sees pay, the guide shows the tip QR, the app installs.
// Usage: node e2e/growth.mjs <base> <out-dir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [base = "http://localhost:3100", out = "."] = process.argv.slice(2);
const errors = [], step = (s) => console.log("✓", s);
const browser = await chromium.launch();
const page = async (w, h, locale = "es-ES") => {
  const p = await (await browser.newContext({ viewport: { width: w, height: h }, locale })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  return p;
};
const signIn = async (p, name) => { await p.goto(`${base}/dev/login`); await p.getByRole("button", { name: `Entrar como ${name}` }).first().click(); await p.waitForLoadState("networkidle"); };
const stamp = Date.now().toString(36);

// a traveller asks before booking, in English
const t = await page(1440, 900, "en-GB");
await t.goto(`${base}/g/madrid-a-pie?lang=en`);
await t.getByText("Message the guide").click();
await t.getByLabel("Your question").fill(`Is the Prado tour OK for a wheelchair? (${stamp})`);
await t.getByLabel("Your name").fill("Mia Jones");
await t.getByLabel("Your email").fill(`mia-${stamp}@example.com`);
await t.getByRole("button", { name: "Send question" }).click();
await t.getByText("Sent. The guide will answer you by email.").waitFor();
step("traveller asked the guide a question");

// and gives a tour as a present (no card payments on this server: the page says so)
await t.goto(`${base}/g/madrid-a-pie/regalo?lang=es`);
await t.getByRole("radio", { name: "50 €" }).click();
await t.getByLabel("Tu nombre").fill("Leo");
await t.getByLabel("Tu correo").fill(`leo-${stamp}@example.com`);
await t.getByLabel("¿Para quién es?").fill("Ana");
await t.getByRole("button", { name: "Comprar tarjeta regalo" }).click();
await t.getByText(/tarjetas regalo todavía no está activada|Tarjeta regalo lista/).first().waitFor();
await t.screenshot({ path: `${out}/G-gift.png` });
step("gift card page: buy flow reaches payment (or says payments are off)");

// the manager answers with a suggested reply
const m = await page(1440, 900);
await signIn(m, "Lucía Ferrer");
await m.goto(`${base}/mensajes?tab=preguntas`);
const card = m.locator("section", { hasText: stamp }).first();
await card.getByRole("button", { name: "Sugerir respuestas" }).click();
await card.getByRole("button", { name: /step-free|Thanks for writing/ }).first().click();
await card.getByRole("button", { name: "Enviar respuesta" }).click();
await m.getByText("Respuesta enviada por correo.").waitFor();
await m.screenshot({ path: `${out}/G-questions.png`, fullPage: true });
step("manager answered with a suggested reply");

await m.goto(`${base}/pagos`);
await m.getByRole("heading", { name: "Lo que se le debe a cada guía" }).waitFor();
await m.getByRole("heading", { name: "Cómo se paga a cada guía" }).waitFor();
await m.screenshot({ path: `${out}/G-pay.png`, fullPage: true });
await m.goto(`${base}/settings`);
await m.getByRole("heading", { name: "Resumen semanal" }).waitFor();
await m.getByText("Ver cómo se vería hoy").click();
await m.getByText(/Esta semana en Madrid a Pie/).waitFor();
await m.goto(`${base}/inicio`);
await m.waitForLoadState("networkidle");
await m.screenshot({ path: `${out}/G-inicio.png`, fullPage: true });
step("pay sheet, weekly summary preview and home");

// the guide's tour page carries the tip QR and its link
const g = await page(390, 844);
await signIn(g, "Diego Martín");
await g.goto(`${base}/clock/tour`);
if (await g.getByRole("heading", { name: "Propinas con tarjeta" }).count()) {
  await g.getByRole("img", { name: "Código QR para dejar propina" }).waitFor();
  await g.screenshot({ path: `${out}/G-tip-qr.png`, fullPage: true });
  const href = await g.getByRole("link", { name: "Abrir el enlace de propina" }).getAttribute("href");
  const tp = await page(390, 844);
  await tp.goto(href.replace(/^https?:\/\/[^/]+/, base));
  await tp.getByRole("radio", { name: "15 €" }).click();
  await tp.screenshot({ path: `${out}/G-tip-page.png`, fullPage: true });
  step("guide shows the tip QR; the tip page opens on the traveller's phone");
} else step("guide has no tour today: QR not shown (nothing to check)");

// installable app
const res = await (await fetch(`${base}/manifest.webmanifest`)).json();
if (res.display !== "standalone" || !res.icons?.length) errors.push("manifest is missing display or icons");
const icon = await fetch(`${base}/pwa-icon/192`);
if (icon.headers.get("content-type") !== "image/png") errors.push("app icon is not a PNG");
if ((await fetch(`${base}/sw.js`)).status !== 200) errors.push("service worker not served");
step("app is installable (manifest, icons, service worker)");

await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("growth OK");
