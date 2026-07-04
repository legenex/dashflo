import path from "node:path";
import fs from "node:fs";

async function main(): Promise<void> {
  const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 1 });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await client.end();
    console.log("[migrate] postgres migrations applied");
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = path.join(process.cwd(), ".data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    await client.close();
    console.log("[migrate] pglite migrations applied");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
