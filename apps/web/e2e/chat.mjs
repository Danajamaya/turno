// Team chat in Chromium: a manager and a guide in two browsers. Channels,
// a message arriving by polling, unread badge, a direct message, a tour card.
// Usage: node e2e/chat.mjs <base> <out-dir>
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const [base = "http://localhost:3100", out = "."] = process.argv.slice(2);
const errors = [], step = (s) => console.log("✓", s);
const browser = await chromium.launch();
const watch = (p) => { p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); return p; };
const signIn = async (name, w = 1440, h = 900) => {
  const p = watch(await (await browser.newContext({ viewport: { width: w, height: h }, locale: "es-ES" })).newPage());
  await p.goto(`${base}/dev/login`);
  await p.getByRole("button", { name: `Entrar como ${name}` }).first().click();
  await p.waitForLoadState("networkidle");
  return p;
};

const lucia = await signIn("Lucía Ferrer");
await lucia.goto(`${base}/equipo`);
for (const c of ["general", "avisos-del-dia", "cambios-de-turno"]) await lucia.getByRole("link", { name: c }).first().waitFor();
step("default channels");

const diego = await signIn("Diego Martín", 390, 844);
await diego.goto(`${base}/equipo`);
const stamp = `Prueba ${Date.now()}`;
await lucia.getByLabel("Mensaje").fill(stamp);
await lucia.getByRole("button", { name: "Enviar" }).click();
await lucia.getByText(stamp).waitFor();
await diego.getByText(stamp).waitFor({ timeout: 10_000 }); // arrives by polling
step("message delivered to the guide's phone without reloading");

await lucia.getByLabel("Adjuntar tour").selectOption({ index: 1 });
await lucia.getByLabel("Mensaje").fill("Este va lleno, llevad bandera");
await lucia.getByRole("button", { name: "Enviar" }).click();
await diego.getByText("Este va lleno, llevad bandera").waitFor({ timeout: 10_000 });
step("tour card shared");

await diego.getByRole("button", { name: /Sara/ }).click();
await diego.waitForURL(/\/equipo\?c=/);
await diego.getByLabel("Mensaje").fill("¿Me cubres el Prado del martes?");
await diego.keyboard.press("Enter");
await diego.getByText("¿Me cubres el Prado del martes?").waitFor();
await lucia.reload();
if (await lucia.getByText("¿Me cubres el Prado del martes?").count()) errors.push("manager can see a direct message between two guides");
step("direct message, invisible to the manager");

if (await diego.evaluate(() => document.documentElement.scrollWidth > innerWidth)) errors.push("chat scrolls sideways at 390px");
await lucia.goto(`${base}/equipo`); await lucia.screenshot({ path: `${out}/E01-desktop.png` });
await diego.goto(`${base}/equipo`); await diego.screenshot({ path: `${out}/E01-mobile.png`, fullPage: true });
await browser.close();
if (errors.length) { console.error("Errors:\n" + errors.join("\n")); process.exit(1); }
console.log("chat OK");
