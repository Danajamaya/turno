// Travellers CRM, message queue, verified review, search, English pages.
// Usage: node e2e/crm.mjs <base> <out-dir> <inbound-secret> <database-url>
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const postgres = require("postgres");
const [base, out, secret, dbUrl] = process.argv.slice(2);
const errors = [], step = (s) => console.log("✓", s);
const browser = await chromium.launch();
const open = async (w = 1440, h = 900, locale = "es-ES") => { const p = await (await browser.newContext({ viewport: { width: w, height: h }, locale })).newPage(); p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); return p; };
const sql = postgres(dbUrl, { max: 1 });
const stamp = Date.now().toString(36);

const owner = await open();
await owner.goto(`${base}/signup`);
await owner.getByLabel("Nombre del negocio").fill(`Málaga Viva ${stamp}`);
await owner.getByLabel("Nombre del local").fill("Málaga");
await owner.getByLabel("Zona horaria del local").selectOption("Europe/Madrid");
await owner.getByLabel("Tu nombre").fill("Elena Soto");
await owner.getByLabel("Tu correo").fill(`elena-${stamp}@example.com`);
await owner.getByRole("button", { name: "Crear mi cuenta" }).click();
await owner.waitForURL("**/team?nuevo=1");
await owner.goto(`${base}/canales`);
const address = (await owner.locator("text=/^r-[a-z0-9]+@/").first().textContent()).trim();
const fmt = (days) => { const d = new Date(Date.now() + days * 86400000); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const send = (text, id) => fetch(`${base}/api/inbound/email`, { method: "POST", headers: { "content-type": "application/json", "x-inbound-secret": secret }, body: JSON.stringify({ to: address, from: "GuruWalk <noreply@guruwalk.com>", subject: "Nueva reserva", text, messageId: `<${stamp}-${id}>`, authenticated: true }) });
await send(`Tour: Málaga histórica\nFecha: ${fmt(1)}\nHora: 10:00\nPersonas: 2\nNombre: Lucía Gil\nTeléfono: +34 611 222 333\nReserva nº: GW${stamp}A1`, 1);
await send(`Tour: Málaga histórica\nFecha: ${fmt(-1)}\nHora: 10:00\nPersonas: 4\nNombre: Oliver Brown\nTeléfono: +44 7700 900456\nReserva nº: GW${stamp}B2`, 2);
await sql`update bookings set status = 'attended' where external_ref = ${"GW" + stamp.toUpperCase() + "B2"}`;
await sql`update travellers set email = ${"oliver-" + stamp + "@example.com"} where name = 'Oliver Brown'`;
step("two bookings arrived");

await owner.goto(`${base}/mensajes`);
await owner.getByText("Recordatorio · mañana").waitFor();
await owner.getByText("Pedir reseña").waitFor();
await owner.screenshot({ path: `${out}/MSG-desktop.png`, fullPage: true });
const reviewCard = owner.locator("section", { hasText: "Oliver Brown" });
await reviewCard.getByRole("button", { name: "Correo" }).click();
await owner.waitForURL("**/mensajes?enviado=1");
const mail = (await readFile(".data/outbox.jsonl", "utf8")).trim().split("\n").map((l) => JSON.parse(l)).filter((m) => m.to.startsWith("oliver-" + stamp)).at(-1);
if (!mail?.subject.includes("How was your tour")) errors.push("review email not in English: " + mail?.subject);
const link = /http\S+\/resena\/[\w-]+/.exec(mail.text)[0].replace(/^https?:\/\/[^/]+/, base);
step("queue prepared; review request emailed in English");

const tr = await open(390, 844, "en-GB");
await tr.goto(link);
await tr.getByRole("heading", { name: "How was it?" }).waitFor();
await tr.getByRole("radio", { name: "5/5" }).click();
await tr.getByLabel("Tell us more (optional)").fill("Elena knows every corner of Málaga. Brilliant!");
await tr.getByRole("button", { name: "Send review" }).click();
await tr.getByText("Thanks for your review!").waitFor();
await tr.goto(link);
await tr.getByText("You already sent this review").waitFor();
step("verified review submitted once, in English");

await owner.goto(`${base}/perfil`);
await owner.getByLabel("Dirección de tu página").fill(`malaga-viva-${stamp}`);
await owner.getByLabel("Ciudad").fill("Málaga");
await owner.getByLabel("Idiomas").fill("Español, English");
await owner.getByLabel("Especialidades").fill("Historia");
await owner.getByLabel("Publicar mi página").check();
await owner.getByRole("button", { name: "Guardar perfil" }).click();
await owner.getByText("Perfil guardado.").waitFor();
await owner.goto(`${base}/perfil?nuevo=1`);
await owner.getByLabel("Nombre", { exact: true }).fill("Málaga histórica");
for (const d of ["Lunes", "Miércoles", "Sábado"]) await owner.getByLabel(d).fill("10:00");
await owner.getByRole("button", { name: "Guardar tour" }).click();
await owner.waitForURL("**/perfil?guardado=1");
const visitor = await open(1440, 900, "en-GB");
await visitor.goto(`${base}/guias?city=malaga`);
await visitor.getByRole("heading", { name: "Tours in Málaga" }).waitFor();
await visitor.getByRole("heading", { name: "Málaga histórica" }).waitFor(); // the tour card
await visitor.getByRole("link", { name: new RegExp(`Málaga Viva ${stamp}`) }).last().waitFor(); // the guide card
await visitor.screenshot({ path: `${out}/SEARCH-desktop.png`, fullPage: true });
await visitor.getByRole("link", { name: new RegExp(`Málaga Viva ${stamp}`) }).last().click();
await visitor.getByText("Elena knows every corner of Málaga. Brilliant!").waitFor();
await visitor.getByText("Verified booking").first().waitFor();
await visitor.screenshot({ path: `${out}/PROFILE-en.png`, fullPage: true });
step("search finds the business (accents ignored) and its profile shows the verified review in English");

await owner.goto(`${base}/viajeros`);
await owner.getByRole("link", { name: "Oliver Brown" }).click();
await owner.getByText("enviado por email").waitFor();
await owner.screenshot({ path: `${out}/CRM-traveller.png`, fullPage: true });
step("traveller history with bookings and messages");

await sql.end(); await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("crm OK");
