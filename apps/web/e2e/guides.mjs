// Guides flow in Chromium: sign up, booking emails arrive through the inbound
// webhook, calendar, review queue, close a tour with tips, income, and the
// platform earnings page. Usage: node e2e/guides.mjs <base> <out-dir> <inbound-secret> <database-url>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const postgres = require("postgres");

const [base = "http://localhost:3100", out = "../../replica/clone-screens", secret, dbUrl] = process.argv.slice(2);
const errors = [];
const step = (s) => console.log("✓", s);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-ES" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const shot = (name, p = page) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });

await page.goto(`${base}/signup`);
await page.getByLabel("Nombre del negocio").fill("Madrid a Pie");
await page.getByLabel("Nombre del local").fill("Madrid");
await page.getByLabel("Zona horaria del local").selectOption("Europe/Madrid");
await page.getByLabel("Tu nombre").fill("Lucía Ferrer");
await page.getByLabel("Tu correo").fill("lucia@example.com");
await page.getByRole("button", { name: "Crear mi cuenta" }).click();
await page.waitForURL("**/team?nuevo=1");
const sql = postgres(dbUrl, { max: 1 });

step("signup");

await page.goto(`${base}/canales`);
const address = (await page.locator("text=/^r-[a-z0-9]+@/").first().textContent()).trim();
step(`forwarding address ${address}`);

const now = new Date();
const d = (days) => { const x = new Date(now.getTime() + days * 86400000); return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`; };
const send = (from, subject, text, id) => fetch(`${base}/api/inbound/email`, { method: "POST", headers: { "content-type": "application/json", "x-inbound-secret": secret },
  body: JSON.stringify({ to: address, from, subject, text, messageId: `<${id}@test>`, authenticated: true }) }).then((r) => r.json());
const results = [
  await send("GuruWalk <noreply@guruwalk.com>", "¡Nueva reserva!", `Tour: Free tour Madrid de los Austrias\nFecha: ${d(1)}\nHora: 10:30\nPersonas: 6\nNombre: Laura Gómez\nTeléfono: +34 600 123 456\nReserva nº: GW48213`, 1),
  await send("Freetour <bookings@freetour.com>", "New booking", `Activity: Madrid Free Walking Tour\nDate: ${d(1)}\nTime: 5:00 PM\nParticipants: 4\nName: John Smith\nBooking ID: FT-55120`, 2),
  await send("GetYourGuide <supplier@getyourguide.com>", "New booking", `Activity: Prado Museum Guided Tour\nDate: ${d(2)}\nTime: 11:00 AM\n2 adults\nName: Anna Müller\nBooking reference: GYGX7Q2P9`, 3),
  await send("Strawberry Tours <info@strawberrytours.com>", "Nueva reserva", `Tienes una reserva para el ${d(3)}`, 4),
  await send("GuruWalk <noreply@guruwalk.com>", "¡Nueva reserva!", `Tour: Free tour Madrid de los Austrias\nFecha: ${d(-1)}\nHora: 10:30\nPersonas: 5\nNombre: Pablo Ruiz\nReserva nº: GW40001`, 5),
];
if (results.map((r) => r.status).join() !== "imported,imported,imported,needs_review,imported") errors.push("unexpected ingest results " + JSON.stringify(results));
const unauth = await fetch(`${base}/api/inbound/email`, { method: "POST", headers: { "content-type": "application/json", "x-inbound-secret": "wrong" }, body: "{}" });
if (unauth.status !== 401) errors.push("webhook accepted a wrong secret");
step("5 emails through the webhook; wrong secret rejected");

await page.goto(`${base}/canales`);
await page.getByText("Por revisar (1)").waitFor();
await shot("G08-desktop");
await page.getByLabel("Nº de reserva").fill("ST-10001");
await page.getByLabel("Personas").fill("3");
await page.getByLabel("Hora").fill("12:00");
await page.getByRole("button", { name: "Agregar al calendario" }).click();
await page.getByText("Reserva agregada al calendario.").waitFor();
step("review queue resolved");

await page.goto(`${base}/calendario`);
await page.getByText("Free tour Madrid de los Austrias").first().waitFor();
await page.goto(`${base}/calendario?semana=${new Date(now.getTime() - 86400000).toISOString().slice(0, 10)}`);
const close = page.getByRole("button", { name: "Cerrar" }).first();
if (await close.count()) {
  await page.getByLabel("Propinas €").first().fill("55");
  await close.click();
  await page.getByText("Asistió").first().waitFor();
  step("closed yesterday's tour with €55 tips");
}
await page.goto(`${base}/calendario`);
await shot("G06-desktop");

await page.goto(`${base}/ingresos`);
await page.getByText("Te quedó").first().waitFor();
await shot("G16-desktop");
step("income page");

const [{ id: uid }] = await sql`select id from users where email = 'lucia@example.com'`;
await sql`insert into platform_admins (user_id) values (${uid}) on conflict do nothing`;
await page.goto(`${base}/admin`);
await page.getByText("Ganancias de Turno").waitFor();
await shot("G20-desktop");
step("platform earnings page (admin)");
await sql.end();

const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-ES", storageState: await ctx.storageState() });
const p3 = await m.newPage();
for (const [path, name] of [["/calendario", "G06-mobile"], ["/canales", "G08-mobile"], ["/ingresos", "G16-mobile"]]) {
  await p3.goto(base + path);
  if (await p3.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) errors.push(`${path}: horizontal scroll at 390px`);
  await shot(name, p3);
}
await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("guides OK");
