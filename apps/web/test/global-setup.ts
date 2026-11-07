// Rebuilds the test database from db/migrations before the run.
import { execFileSync } from "node:child_process";
import path from "node:path";
import postgres from "postgres";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to an empty Postgres database (it is wiped).");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; create schema public;");
  await sql.end();
  execFileSync("node", [path.join(__dirname, "../scripts/migrate.mjs")], { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
