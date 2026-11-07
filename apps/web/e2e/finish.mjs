// Profile, packages, public booking, guide assignment, check-in with tips,
// calendar feed. Usage: node e2e/finish.mjs <base> <out-dir> <database-url>
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const postgres = require("postgres");
const [base = "http://localhost:3100", out = ".", dbUrl] = process.argv.slice(2);
const errors = [], step = (s) => console.log("✓", s);
const browser = await chromium.launch();
const page = async (w = 1440, h = 900) => { const p = await (await browser.newContext({ viewport: { width: w, height: h }, locale: "es-ES" })).newPage(); p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); return p; };
const signIn = async (p, name) => { await p.goto(`${base}/dev/login`); await p.getByRole("button", { name: `Entrar como ${name}` }).first().click(); await p.waitForLoadState("networkidle"); };
const sql = postgres(dbUrl, { max: 1 });

// owner signs up and adds a guide
const owner = await page();
await owner.goto(`${base}/signup`);
await owner.getByLabel("Nombre del negocio").fill("Sevilla Secreta");
await owner.getByLabel("Nombre del local").fill("Sevilla");
await owner.getByLabel("Zona horaria del local").selectOption("Europe/Madrid");
await owner.getByLabel("Tu nombre").fill("Carmen Vidal");
await owner.getByLabel("Tu correo").fill(`carmen${Date.now()}@example.com`);
await owner.getByRole("button", { name: "Crear mi cuenta" }).click();
await owner.waitForURL("**/team?nuevo=1");
await owner.getByLabel("Nombre completo").fill("Pablo Ríos");
await owner.getByLabel("Correo (opcional)").fill(`pablo${Date.now()}@example.com`);
await owner.getByRole("button", { name: "Agregar e invitar" }).click();
await owner.getByText("Pablo Ríos se agregó al equipo.").waitFor();

// profile and a per-person package with a departure every day
await owner.goto(`${base}/perfil`);
const slug = `sevilla-secreta-${Date.now().toString(36)}`;
await owner.getByLabel("Dirección de tu página").fill(slug);
await owner.getByLabel("Frase de presentación").fill("Sevilla contada por sevillanos");
await owner.getByLabel("Ciudad").fill("Sevilla");
await owner.getByLabel("Idiomas").fill("Español, English");
await owner.getByLabel("Publicar mi página").check();
await owner.getByRole("button", { name: "Guardar perfil" }).click();
await owner.getByText("Perfil guardado.").waitFor();
await owner.goto(`${base}/perfil?nuevo=1`);
await owner.getByLabel("Nombre", { exact: true }).fill("Alcázar con guía");
await owner.getByLabel("Precio").selectOption("per_person");
await owner.getByLabel(/Importe/).fill("35");
await owner.getByLabel("Plazas por salida").fill("12");
for (const d of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]) await owner.getByLabel(d).fill("10:00, 21:30");
await owner.getByRole("button", { name: "Guardar tour" }).click();
await owner.waitForURL("**/perfil?guardado=1");
await owner.screenshot({ path: `${out}/G17-desktop.png`, fullPage: true });
step("profile published and package created");

// a traveller books on the public page
const traveller = await page(390, 844);
await traveller.goto(`${base}/g/${slug}`);
await traveller.getByRole("heading", { name: "Alcázar con guía" }).waitFor();
await traveller.screenshot({ path: `${out}/G02-mobile.png`, fullPage: true });
await traveller.getByRole("radio").first().click();
await traveller.getByLabel("Personas").fill("3");
await traveller.getByLabel("Tu nombre").fill("Emma Wilson");
await traveller.getByLabel("Correo").fill("emma@example.com");
await traveller.getByRole("button", { name: "Reservar" }).click();
await traveller.getByRole("heading", { name: "¡Reserva confirmada!" }).waitFor();
await traveller.getByText("105,00 € en el punto de encuentro").waitFor();
if (await traveller.evaluate(() => document.documentElement.scrollWidth > innerWidth)) errors.push("public page scrolls sideways on a phone");
step("traveller booked 3 people at 35 €");

// owner assigns Pablo to that tour
await owner.goto(`${base}/calendario`);
let found = await owner.getByLabel(/Guía de Alcázar con guía/).count();
if (!found) { await owner.getByRole("link", { name: "Semana siguiente" }).click(); await owner.waitForLoadState("networkidle"); }
await owner.getByLabel(/Guía de Alcázar con guía/).first().selectOption({ label: "Pablo Ríos" });
await owner.getByRole("button", { name: "Asignar" }).first().click();
await owner.waitForLoadState("networkidle");
step("guide assigned");

// move the booking to today so the guide sees it in "today", then check in and close
await sql`update bookings set starts_at = date_trunc('hour', now()) + interval '1 hour' where platform = 'turno' and tour_name = 'Alcázar con guía'`;
const guide = await page(390, 844);
await signIn(guide, "Pablo Ríos");
await guide.goto(`${base}/clock`);
await guide.getByText("Mis tours de hoy").waitFor();
await guide.getByRole("link", { name: /Pasar lista/ }).first().click();
await guide.getByRole("button", { name: /Emma Wilson llegó/ }).click();
await guide.waitForLoadState("networkidle");
await guide.getByText("3 de 3 llegaron").waitFor();
await guide.getByLabel(/Propinas en efectivo/).fill("20");
await guide.getByRole("button", { name: "Cerrar tour" }).click();
await guide.getByText("Tour cerrado. ¡Buen trabajo!").waitFor();
await guide.screenshot({ path: `${out}/APP-checkin-mobile.png`, fullPage: true });
step("guide checked people in and closed with 20 € tips");

// calendar feed for the guide
await guide.goto(`${base}/account`);
await guide.getByRole("button", { name: "Crear mi enlace de calendario" }).click();
const url = (await guide.locator("p.font-mono").textContent()).trim();
const ics = await fetch(url.replace(/^https?:\/\/[^/]+/, base)).then((r) => r.text());
if (!ics.includes("SUMMARY:Alcázar con guía · 3 personas")) errors.push("calendar feed missing the tour: " + ics.slice(0, 300));
step("calendar feed lists the guide's tour");

// owner's income shows Turno sale with commission
await owner.goto(`${base}/ingresos`);
await owner.getByText("Turno").first().waitFor();
await owner.goto(`${base}/planes`);
await owner.getByText("Tu plan actual").waitFor();
await owner.screenshot({ path: `${out}/PLANES-desktop.png`, fullPage: true });
await sql.end();
await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("finish OK");
