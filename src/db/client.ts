import * as schema from "./schema";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import path from "node:path";
import fs from "node:fs";

// Driver abstraction: Postgres when DATABASE_URL is set, embedded PGlite otherwise.
// Both drivers expose the same drizzle query API. We type the handle by the PGlite
// shape and adapt the postgres-js handle to it, the runtime behavior is identical
// for the query surface DashFlo uses.
export type Db = PgliteDatabase<typeof schema>;

interface DbGlobal {
  __dashflo_db?: Db;
  __dashflo_db_mode?: "postgres" | "pglite";
}

const g = globalThis as unknown as DbGlobal;

async function createDb(): Promise<{ db: Db; mode: "postgres" | "pglite" }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 8 });
    const db = drizzle(client, { schema }) as unknown as Db;
    return { db, mode: "postgres" };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  return { db, mode: "pglite" };
}

let pending: Promise<{ db: Db; mode: "postgres" | "pglite" }> | null = null;

export async function getDb(): Promise<Db> {
  if (g.__dashflo_db) return g.__dashflo_db;
  if (!pending) pending = createDb();
  const { db, mode } = await pending;
  g.__dashflo_db = db;
  g.__dashflo_db_mode = mode;
  return db;
}

export function getDbMode(): "postgres" | "pglite" {
  return g.__dashflo_db_mode ?? (process.env.DATABASE_URL ? "postgres" : "pglite");
}

export { schema };
