// End-to-end run of the vertical slice against a running server, with
// screenshots for replica-diff. Usage: node e2e/slice.mjs http://localhost:3100 <out-dir>
import { createRequire } from "node:module";

// Uses the machine's Playwright (NODE_PATH="$(npm root -g)"), not a project dependency.
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "../../replica/clone-screens";
const tz = "America/Chicago";
const parts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
const nowLocal = parts(new Date());
const today = `${nowLocal.year}-${nowLocal.month}-${nowLocal.day}`;
const startHour = String(Number(nowLocal.hour)).padStart(2, "0") + ":00";
const endHour = String((Number(nowLocal.hour) + 8) % 24).padStart(2, "0") + ":00";

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-US" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
const shot = async (name, p = page) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const step = (s) => console.log("✓", s);

// F01: owner signs up (S01) and adds the team (S02/S03)
await page.goto(`${base}/signup`);
await shot("S01-desktop");
await page.getByLabel("Nombre del negocio").fill("Taquería La Esquina");
await page.getByLabel("Giro (opcional)").fill("Restaurante");
await page.getByLabel("Nombre del local").fill("Centro");
await page.getByLabel("Zona horaria del local").selectOption(tz);
await page.getByLabel("Tu nombre").fill("Rosa Martínez");
await page.getByLabel("Tu correo").fill("rosa@example.com");
await page.getByRole("button", { name: "Crear mi cuenta" }).click();
await page.waitForURL("**/team?nuevo=1");
step("signup -> team");

for (const [name, phone, role, wage, email] of [["Ana Torres", "5550100001", "Cocinera", "18.50", "ana@example.com"], ["Luis Pérez", "5550100002", "Mesero", "12", ""]]) {
  await page.getByLabel("Nombre completo").fill(name);
  await page.getByLabel("Celular").fill(phone);
  await page.getByLabel("Correo (opcional)").fill(email);
  await page.getByLabel("Puesto").fill(role);
  await page.getByLabel("Sueldo por hora (USD)").fill(wage);
  await page.getByRole("button", { name: "Agregar e invitar" }).click();
  await page.getByText(`${name} se agregó al equipo.`).waitFor();
}
// validation: no contact info
await page.getByLabel("Nombre completo").fill("Sin Contacto");
await page.getByRole("button", { name: "Agregar e invitar" }).click();
await page.getByRole("alert").getByText("Agrega un celular", { exact: false }).waitFor();
await shot("S03-desktop");
step("team: 2 people added, missing-contact rejected");

// Sign out and back in with an emailed one-time link
await page.getByRole("button", { name: "Salir" }).click();
await page.waitForURL("**/login");
await page.getByLabel("Tu correo").fill("rosa@example.com");
await page.getByRole("button", { name: "Mandarme el enlace" }).click();
await page.getByRole("status").getByText("tiene cuenta, te mandamos un enlace", { exact: false }).waitFor();
const { readFile } = await import("node:fs/promises");
const mails = (await readFile(".data/outbox.jsonl", "utf8")).trim().split("\n").map((l) => JSON.parse(l));
const link = /http\S+token=[\w-]+/.exec(mails.filter((m) => m.to === "rosa@example.com").at(-1).text)[0];
await page.goto(link);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL("**/schedule");
step("signed out and back in with an emailed link");

// F02: build and publish (S05/S06/S08)
await page.goto(`${base}/schedule`);
const anaLink = page.getByRole("link", { name: new RegExp(`Agregar turno a Ana Torres`) });
const hrefs = await anaLink.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
const todayHref = hrefs.find((h) => h.endsWith(`_${today}`));
await page.goto(base + todayHref);
await page.getByLabel("Entrada").fill(startHour);
await page.getByLabel("Salida").fill(endHour);
await page.getByRole("button", { name: "Guardar turno" }).click();
await page.waitForURL(/\/schedule\?semana=/);
// double booking is rejected
await page.goto(base + todayHref);
await page.getByLabel("Entrada").fill(startHour);
await page.getByLabel("Salida").fill(endHour);
await page.getByRole("button", { name: "Guardar turno" }).click();
await page.getByRole("alert").getByText("ya tiene un turno", { exact: false }).waitFor();
step("shift created; overlapping shift rejected");
await page.goto(`${base}/schedule`);
await page.getByText("Cambios sin publicar.").waitFor();
await shot("S05-draft-desktop");
await page.getByRole("button", { name: "Publicar" }).click();
await page.getByText("Horario publicado.").waitFor();
await shot("S05-desktop");
step("week published");

// F05: employee clocks in on a phone (S16)
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-US", isMobile: true, hasTouch: true });
const p2 = await phone.newPage();
p2.on("pageerror", (e) => errors.push(String(e)));
await p2.goto(`${base}/dev/login`);
await p2.getByRole("button", { name: "Entrar como Ana Torres" }).click();
await p2.waitForURL("**/clock");
await p2.getByText("Mis próximos turnos").waitFor();
await p2.getByRole("button", { name: "Checar entrada" }).click();
await p2.getByRole("button", { name: "Checar salida" }).waitFor();
await p2.waitForTimeout(1500);
await shot("S16-mobile", p2);
await p2.getByRole("button", { name: "Checar salida" }).click();
await p2.getByRole("button", { name: "Checar entrada" }).waitFor();
step("employee clocked in and out on phone");

// F08: manager approves (S17)
await page.goto(`${base}/timesheets`);
await page.getByText("Ana Torres").first().waitFor();
await page.getByRole("button", { name: /Aprobar 1/ }).click();
await page.getByRole("button", { name: "Todo aprobado" }).waitFor();
await shot("S17-desktop");
step("timesheet approved");

// phone widths for the manager screens
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "es-US", storageState: await ctx.storageState() });
const p3 = await m.newPage();
for (const [path, name] of [["/schedule", "S05-mobile"], ["/team", "S03-mobile"], ["/timesheets", "S17-mobile"], ["/settings", "S23-mobile"]]) {
  await p3.goto(base + path);
  const overflow = await p3.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) errors.push(`${path}: page scrolls horizontally at 390px`);
  await shot(name, p3);
}
step("mobile screenshots");

await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("slice OK");
