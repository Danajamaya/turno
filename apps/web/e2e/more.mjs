// Seasons, AI tour drafts, cities, WhatsApp settings and the sustainable filter in Chromium, on the demo data (Madrid a Pie).
// Usage: node e2e/more.mjs <base> <out-dir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [base = "http://localhost:3100", out = "."] = process.argv.slice(2);
const errors = [], step = (s) => console.log("✓", s);
const browser = await chromium.launch();
const page = async (w, h) => { const p = await (await browser.newContext({ viewport: { width: w, height: h }, locale: "es-ES" })).newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };

// manager: AI draft, a season, sustainable options, cities, WhatsApp
const m = await page(1440, 900);
await m.goto(`${base}/dev/login`);
await m.getByRole("button", { name: "Entrar como Lucía Ferrer" }).first().click();
await m.waitForLoadState("networkidle");
await m.goto(`${base}/perfil`);
await m.getByLabel("Cuéntalo como se lo contarías a un amigo").fill("Ruta de tapas de 3 horas por La Latina y el Mercado de San Miguel, 35 euros con vino incluido");
await m.getByRole("button", { name: "Preparar el tour" }).click();
await m.getByText(/Borrador (escrito con IA|a partir de lo que escribiste)/).waitFor();
const title = await m.locator('input[name="title"]').last().inputValue();
if (!/tapas/i.test(title)) errors.push(`AI draft title: ${title}`);
if ((await m.locator('input[name="durationMin"]').last().inputValue()) !== "180") errors.push("AI draft duration");
await m.screenshot({ path: `${out}/M-ai.png`, fullPage: true });
step("AI tour draft");

const season = `Temporada e2e ${Date.now()}`;
await m.getByLabel("Nombre de la temporada").fill(season);
await m.locator("#se-from").fill("2027-04-01");
await m.locator("#se-to").fill("2027-04-08");
await m.locator("#se-pct").fill("20");
await m.getByRole("button", { name: "Añadir temporada" }).click();
await m.getByText(season).waitFor();
await m.getByRole("group", { name: "Turismo sostenible" }).waitFor();
step("season saved; sustainable options on the profile form");

await m.goto(`${base}/ciudades`);
await m.getByRole("heading", { name: "Ciudades", level: 1 }).waitFor();
await m.getByRole("heading", { name: "Añadir una ciudad" }).waitFor();
await m.screenshot({ path: `${out}/M-cities.png`, fullPage: true });
await m.goto(`${base}/settings`);
await m.getByRole("heading", { name: "WhatsApp y clientes que repiten" }).waitFor();
await m.getByLabel("Descuento para quien repite (%)").waitFor();
step("cities panel and WhatsApp settings");

// traveller: the sustainable filter toggles on and off
const t = await page(1440, 900);
await t.goto(`${base}/guias`);
await t.getByRole("link", { name: "Turismo sostenible" }).click();
await t.waitForURL(/sustainable=1/);
await t.getByRole("link", { name: "Turismo sostenible" }).and(t.locator('[aria-current="page"]')).waitFor();
await t.screenshot({ path: `${out}/M-sustainable.png`, fullPage: true });
const wa = await fetch(`${base}/api/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
if (wa.status !== 403) errors.push(`WhatsApp webhook accepts a wrong verify token: ${wa.status}`);
const post = await fetch(`${base}/api/whatsapp`, { method: "POST", body: "{}", headers: { "x-hub-signature-256": "sha256=00" } });
if (post.status < 400) errors.push(`WhatsApp webhook accepts an unsigned delivery: ${post.status}`);
step("sustainable filter; WhatsApp webhook refuses unverified calls");

await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("more OK");
