#!/usr/bin/env node
// DashFlo setup: bring up docker postgres when available, run migrations,
// seed the demo dataset, and print credentials. Falls back to embedded
// PGlite automatically when Docker or Postgres is unavailable.
import { execSync, spawnSync } from "node:child_process";

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

function hasDocker() {
  try {
    sh("docker info", { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

let mode = "pglite";
if (process.env.DATABASE_URL) {
  mode = "postgres";
  console.log("[setup] DATABASE_URL set, using Postgres");
} else if (hasDocker()) {
  console.log("[setup] Docker detected, starting postgres via docker compose...");
  try {
    sh("docker compose up -d postgres", { timeout: 120000 });
    process.env.DATABASE_URL = "postgres://dashflo:dashflo@localhost:5433/dashflo";
    mode = "postgres";
    // wait for health
    for (let i = 0; i < 30; i++) {
      try {
        sh("docker compose exec -T postgres pg_isready -U dashflo", { timeout: 5000 });
        break;
      } catch {
        spawnSync("sleep", ["1"]);
      }
    }
  } catch (e) {
    console.log("[setup] docker compose failed, falling back to PGlite:", e.message);
    mode = "pglite";
    delete process.env.DATABASE_URL;
  }
} else {
  console.log("[setup] Docker unavailable, using embedded PGlite at ./.data/pglite");
}

console.log(`[setup] database mode: ${mode}`);

const tsx = process.platform === "win32" ? "node_modules\\.bin\\tsx.cmd" : "node_modules/.bin/tsx";

console.log("[setup] running migrations...");
execSync(`${tsx} src/scripts/migrate.ts`, { stdio: "inherit", env: process.env });

console.log("[setup] seeding demo data...");
execSync(`${tsx} src/scripts/seed-cli.ts`, { stdio: "inherit", env: process.env });

console.log("\n[setup] done. Run `pnpm dev` and open http://localhost:4780");
