// Postgres access. User requests run inside withUser(): a transaction as the
// restricted turno_app role with app.user_id set, so row level security in
// db/migrations applies on top of the explicit checks in store.ts. Only
// flows that must cross that boundary (sign-up, sign-in, punches after their
// rules are checked) use system().
import "server-only";
import postgres from "postgres";

type Sql = postgres.Sql<{}>;
export type Tx = postgres.TransactionSql<{}>;

const g = globalThis as unknown as { __turnoSql?: Sql };

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    transform: postgres.camel,
    onnotice: () => {},
    // timestamptz as ISO strings, the shape the screens already use
    types: {
      instant: {
        to: 1184,
        from: [1114, 1184],
        serialize: (x: Date | string) => (x instanceof Date ? x.toISOString() : x),
        parse: (x: string) => new Date(x).toISOString(),
      },
      // date columns (week_start) stay "YYYY-MM-DD" strings
      localDate: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

export const sql: Sql = (g.__turnoSql ??= connect());

export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`set local role turno_app`;
    return fn(tx);
  }) as Promise<T>;
}

export function system<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(fn) as Promise<T>;
}

/** Postgres error code of a failed query, if any. */
export const pgCode = (e: unknown): string | undefined =>
  typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
