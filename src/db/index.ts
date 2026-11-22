import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";
import * as schema from "./schema";

// Production talks to Neon over WebSockets (the neon-serverless Pool driver, so
// interactive transactions work). Local development and tests point
// DATABASE_URL at a plain Postgres, reached with node-postgres.

function isLocalPostgres(url: string) {
  if (process.env.DATABASE_DRIVER === "pg") return true;
  if (process.env.DATABASE_DRIVER === "neon") return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (isLocalPostgres(url)) return drizzlePg(new PgPool({ connectionString: url, max: 10 }), { schema });
  neonConfig.webSocketConstructor = ws;
  return drizzleNeon(new NeonPool({ connectionString: url }), { schema }) as unknown as ReturnType<typeof drizzlePg<typeof schema>>;
}

export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

const globalForDb = globalThis as unknown as { __gbDb?: DB };

/** Lazily created so `next build` can import modules without a database. */
export function getDb(): DB {
  if (!globalForDb.__gbDb) globalForDb.__gbDb = createDb();
  return globalForDb.__gbDb;
}

export const db = new Proxy({} as DB, { get: (_t, prop, receiver) => Reflect.get(getDb(), prop, receiver) });

export { schema };
