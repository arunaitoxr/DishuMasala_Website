/**
 * A DB client for standalone Node scripts (scripts/seed.ts, scripts/migrate-images.ts) — run via
 * `tsx`, outside of Next.js's React Server Component context. It deliberately does NOT
 * `import "server-only"` (that package throws unconditionally outside the "react-server" bundler
 * condition, which a plain tsx/Node process never has).
 *
 * It uses the same `pg` driver lib/db/index.ts now uses against Supabase, but keeps its own pool:
 * scripts have none of the deployed app's serverless-connection-limit concerns — they are one-off,
 * long-lived Node processes — so they size and close their pool themselves, and connect directly
 * rather than through the Supavisor transaction pooler. This file still lives
 * under lib/db/ so the "no drizzle-orm import outside lib/db/" ESLint rule holds without an
 * exception: scripts import the constructed `db` from here, never drizzle-orm directly. The `eq`
 * re-export below exists for the same reason — a script that needs a `where` clause imports it
 * from here instead of reaching for `drizzle-orm` itself.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export { and, eq, inArray, sql } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const pool = new Pool({ connectionString: databaseUrl });

export const scriptDb = drizzle(pool, { schema });

export async function closeScriptDb(): Promise<void> {
  await pool.end();
}
