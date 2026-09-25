import "server-only";

import { Pool } from "pg";

// Next dev reloads modules on every edit; without the global cache each
// reload would open a fresh pool and leak connections.
const globalForDb = globalThis as unknown as { pixiPool?: Pool };

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add it to frontend/.env.local");
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Managed providers (Neon, Supabase, RDS) need TLS; a local server
    // usually isn't configured for it.
    ssl: process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
  });
}

export const pool = globalForDb.pixiPool ?? create();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pixiPool = pool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query(text, params as never[]);
  return result.rows as T[];
}

/** Returns the first row, or null. */
export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Turns a connection/setup failure into a message worth showing, so a
 * misconfigured DATABASE_URL reads as guidance instead of a blank 500.
 * Returns null when the error is not a connection problem.
 */
export function describeDbError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;

  const code = (error as NodeJS.ErrnoException & { code?: string }).code;

  switch (code) {
    case "28P01":
      return "Database rejected the username or password. Check DATABASE_URL in frontend/.env.local";
    case "3D000":
      return "That database doesn't exist yet. Create it in pgAdmin, then run database/01_schema.sql";
    case "42P01":
      return "The tables don't exist yet. Run database/01_schema.sql in pgAdmin.";
    case "ECONNREFUSED":
      return "Couldn't reach PostgreSQL. Is the server running, and is the port in DATABASE_URL right?";
    case "ENOTFOUND":
      return "Couldn't resolve the database host in DATABASE_URL.";
    case "ETIMEDOUT":
      return "Timed out connecting to PostgreSQL.";
  }

  if (error.message.includes("DATABASE_URL is not set")) {
    return error.message;
  }

  return null;
}
