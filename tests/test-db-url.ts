import { config } from "dotenv";

config({ path: [".env.test", ".env.local"], quiet: true });

/** Tests run against TEST_DATABASE_URL (a throwaway Postgres; it is wiped). */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/gstbilling_test";
