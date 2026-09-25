/*
 * Runs a .sql file from database/ against the local Pixi database.
 *
 *   node database/scripts/migrate.cjs 03_trusted_devices.sql
 *
 * Reads DATABASE_URL from frontend/.env.local so the connection string
 * lives in exactly one place.
 */
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const SQL_DIR = path.join(__dirname, "..");
const FRONTEND = path.join(__dirname, "..", "..", "frontend");
const ENV_FILE = path.join(FRONTEND, ".env.local");

// Node resolves from the script's own directory, and pnpm keeps `pg` inside
// frontend/node_modules — so resolve from there explicitly.
const { Client } = createRequire(path.join(FRONTEND, "package.json"))("pg");

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const text = fs.readFileSync(ENV_FILE, "utf8");
  const line = text
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));

  if (!line) {
    throw new Error("DATABASE_URL not found in frontend/.env.local");
  }
  return line.slice(line.indexOf("=") + 1).trim();
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node database/scripts/migrate.cjs <file.sql>");
  process.exit(1);
}

(async () => {
  const c = new Client({ connectionString: connectionString() });
  await c.connect();
  try {
    const sql = fs.readFileSync(path.join(SQL_DIR, file), "utf8");
    await c.query(sql);
    console.log(`${file}: ok`);
  } catch (e) {
    console.log(`ERROR ${e.code || ""}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
