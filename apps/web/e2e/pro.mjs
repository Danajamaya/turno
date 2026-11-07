// Money, sales, operations, platforms and trust in Chromium, on the demo data (Madrid a Pie).
// Usage: node e2e/pro.mjs <base> <out-dir>
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
const [base = "http://localhost:3100", out = "."] = process.argv.slice(2);
const errors = [], step = (s) => console.log("✓", s);
const browser = await chromium.launch();
const page = async (w, h, locale = "es-ES") => { const p = await (await browser.newContext({ viewport: { width: w, height: h }, locale })).newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const signIn = async (p, name) => { await p.goto(`${base}/dev/login`); await p.getByRole("button", { name: `Entrar como ${name}` }).first().click(); await p.waitForLoadState("networkidle"); };

// traveller: route, quote form, discount field, city page, widget
const t = await page(1440, 900);
await t.goto(`${base}/g/madrid-a-pie`);
await t.getByText("Recorrido (5)").first().click();
await t.getByRole("link", { name: /Palacio Real/ }).first().waitFor();
await t.getByRole("heading", { name: "Grupos, colegios y empresas" }).waitFor();
if (!(await t.locator('script[type="application/ld+json"]').count())) errors.push("profile has no structured data");
await t.screenshot({ path: `${out}/P-profile.png`, fullPage: true });
await t.goto(`${base}/tours/madrid`);
await t.getByRole("heading", { name: "Tours en Madrid" }).waitFor();
if (!/Free tours y visitas guiadas en Madrid/.test(await t.title())) errors.push("city page title missing");
await t.goto(`${base}/embed/madrid-a-pie`);
await t.getByText("Free tour Madrid de los Austrias").first().waitFor();
const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
if (!sitemap.includes("/g/madrid-a-pie") || !sitemap.includes("/tours/madrid")) errors.push("sitemap misses pages");
if (!(await (await fetch(`${base}/robots.txt`)).text()).includes("Disallow: /api/")) errors.push("robots.txt");
step("route, quotes, structured data, city page, widget, sitemap and robots");

// manager: fiscal data, codes, platforms, imports, API key, yearly report
const m = await page(1440, 900);
await signIn(m, "Lucía Ferrer");
await m.goto(`${base}/settings`);
await m.getByRole("heading", { name: "Datos fiscales y reseñas en Google" }).waitFor();
await m.getByRole("heading", { name: "Insignia de guía verificado" }).waitFor();
await m.goto(`${base}/perfil`);
await m.getByText("HOTELPRADO10").waitFor();
await m.getByLabel("Código para tu web").waitFor();
await m.goto(`${base}/mensajes?tab=preguntas`);
await m.getByText(/Presupuesto: 48 personas/).waitFor();
await m.goto(`${base}/ingresos/plataformas`);
await m.getByRole("heading", { name: "¿Dónde te conviene vender?" }).waitFor();
await m.screenshot({ path: `${out}/P-compare.png`, fullPage: true });
await m.goto(`${base}/ingresos/anual`);
await m.getByRole("link", { name: /Descargar para la gestoría/ }).waitFor();
await m.screenshot({ path: `${out}/P-year.png`, fullPage: true });
await m.goto(`${base}/canales`);
const csvPath = `${out}/import.csv`;
writeFileSync(csvPath, `fecha;hora;tour;personas;plataforma;nombre;referencia\n01/09/2026;10:30;Free tour Madrid de los Austrias;3;guruwalk;Import Test;E2E-${Date.now()}\n`);
await m.getByLabel("Archivo CSV").setInputFiles(csvPath);
await m.getByRole("button", { name: "Importar" }).click();
await m.getByText(/1 reservas importadas/).waitFor();
await m.getByLabel("Nombre", { exact: true }).fill(`Viator e2e ${Date.now()}`);
await m.getByRole("button", { name: "Crear clave" }).click();
const key = (await m.locator("code").filter({ hasText: /^turno_/ }).first().textContent()).trim();
await m.screenshot({ path: `${out}/P-channels.png`, fullPage: true });
const res = await fetch(`${base}/api/octo/products`, { headers: { Authorization: `Bearer ${key}` } });
const products = await res.json();
if (res.status !== 200 || !products.some((p) => p.internalName === "Free tour Madrid de los Austrias")) errors.push(`OCTO products failed: ${res.status}`);
if ((await fetch(`${base}/api/octo/products`, { headers: { Authorization: "Bearer wrong" } })).status !== 401) errors.push("OCTO accepts a wrong key");
step("fiscal data, verification, codes, widget code, quotes, comparison, yearly report, CSV import, OCTO API");

// guide: equipment, latecomers link, swap
const g = await page(390, 844);
await signIn(g, "Diego Martín");
await g.goto(`${base}/clock/tour`);
if (await g.getByRole("heading", { name: "Antes de salir" }).count()) {
  const flag = g.getByRole("button", { name: /Bandera amarilla/ });
  const was = await flag.getAttribute("aria-pressed");
  await flag.click();
  await g.locator(`button[aria-pressed="${was === "true" ? "false" : "true"}"]`, { hasText: "Bandera amarilla" }).waitFor();
  await g.getByText(/de 3 listos/).waitFor();
  await g.getByRole("button", { name: "Compartir dónde está el grupo" }).waitFor();
  const href = await g.getByRole("link", { name: "Ver lo que ven ellos" }).getAttribute("href");
  const lp = await page(390, 844);
  await lp.goto(href.replace(/^https?:\/\/[^/]+/, base));
  await lp.getByText("Punto de encuentro").or(lp.getByText("El grupo está aquí")).first().waitFor();
  await lp.screenshot({ path: `${out}/P-group.png`, fullPage: true });
  await g.screenshot({ path: `${out}/P-guide-tour.png`, fullPage: true });
  step("guide checks equipment; the latecomers' page opens");
} else step("guide has no Austrias tour today (nothing to check)");

await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("pro OK");
