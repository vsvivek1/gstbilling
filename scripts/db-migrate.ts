import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool as PgPool } from "pg";
import ws from "ws";

/** Apply drizzle/ migrations to DATABASE_URL (run on every Vercel build). */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const local = process.env.DATABASE_DRIVER === "pg" || ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
  if (local) {
    const pool = new PgPool({ connectionString: url, max: 1 });
    await migratePg(drizzlePg(pool), { migrationsFolder: "drizzle" });
    await pool.end();
  } else {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url });
    await migrateNeon(drizzleNeon(pool), { migrationsFolder: "drizzle" });
    await pool.end();
  }
  console.log("migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
