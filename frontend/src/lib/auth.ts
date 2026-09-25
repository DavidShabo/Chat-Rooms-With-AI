import { cookies } from "next/headers";
import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { queryOne, query } from "@/lib/db";

const scrypt = promisify(scryptCallback);

export const SESSION_COOKIE = "pixi_session";
export const DEVICE_COOKIE = "pixi_device";
const SESSION_DAYS = 30;
/** How long "Remember this device" skips the emailed code. */
const REMEMBER_DAYS = 7;
const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

// ---------------------------------------------------------------------------
// Passwords — scrypt, from Node's stdlib. Format: scrypt$<salt hex>$<key hex>
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  const key = (await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    64
  )) as Buffer;
  const expected = Buffer.from(keyHex, "hex");

  if (key.length !== expected.length) return false;
  // Constant time: a length-independent compare leaks the digest byte by byte.
  return timingSafeEqual(key, expected);
}

/**
 * Passwords are checked here rather than only in the browser, because
 * client-side validation is a convenience, not a control.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) {
    return "Password must be at least 10 characters.";
  }
  if (password.length > 200) {
    return "Password must be under 200 characters.";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain a letter and a number.";
  }
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailLooksValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ---------------------------------------------------------------------------
// Verification codes
// ---------------------------------------------------------------------------

/** Six digits, uniformly distributed. Leading zeros preserved. */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Codes are short and high-entropy-limited, so a fast hash is correct here —
 * scrypt would add latency without adding meaningful resistance to a
 * six-digit space that is already guarded by expiry and attempt limits.
 */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export type CodePurpose = "email_verify" | "password_reset" | "login_mfa";

export async function issueCode(
  userId: string,
  purpose: CodePurpose = "email_verify"
): Promise<string> {
  const code = generateCode();

  // Retire any outstanding codes so only the newest one works.
  await query(
    `UPDATE verification_codes
        SET consumed_at = now()
      WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose]
  );

  await query(
    `INSERT INTO verification_codes (user_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, hashCode(code), purpose, String(CODE_TTL_MINUTES)]
  );

  return code;
}

type CodeRow = {
  id: string;
  code_hash: string;
  attempt_count: number;
};

export type CodeResult = "ok" | "invalid" | "expired" | "too_many_attempts";

export async function consumeCode(
  userId: string,
  code: string,
  purpose: CodePurpose = "email_verify"
): Promise<CodeResult> {
  const row = await queryOne<CodeRow>(
    `SELECT id, code_hash, attempt_count
       FROM verification_codes
      WHERE user_id = $1
        AND purpose = $2
        AND consumed_at IS NULL
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, purpose]
  );

  if (!row) return "expired";

  if (row.attempt_count >= MAX_CODE_ATTEMPTS) {
    return "too_many_attempts";
  }

  const supplied = Buffer.from(hashCode(code), "hex");
  const expected = Buffer.from(row.code_hash, "hex");
  const matches =
    supplied.length === expected.length && timingSafeEqual(supplied, expected);

  if (!matches) {
    await query(
      `UPDATE verification_codes
          SET attempt_count = attempt_count + 1
        WHERE id = $1`,
      [row.id]
    );
    return "invalid";
  }

  await query(
    `UPDATE verification_codes SET consumed_at = now() WHERE id = $1`,
    [row.id]
  );
  return "ok";
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {}
): Promise<string> {
  // 32 random bytes; only the hash is persisted.
  const token = randomBytes(32).toString("base64url");

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [
      userId,
      hashToken(token),
      String(SESSION_DAYS),
      meta.userAgent ?? null,
      meta.ip ?? null,
    ]
  );

  return token;
}

export type SessionUser = {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const user = await queryOne<SessionUser>(
    `SELECT u.id, u.email, u.display_name, u.timezone
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.email_verified_at IS NOT NULL`,
    [hashToken(token)]
  );

  if (user) {
    // Fire and forget; a failed touch must not break the request.
    query(
      `UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1`,
      [hashToken(token)]
    ).catch(() => {});
  }

  return user;
}

export async function revokeSession(token: string): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`,
    [hashToken(token)]
  );
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

// ---------------------------------------------------------------------------
// Trusted devices
//
// Every sign-in requires an emailed code unless this browser holds a valid
// device token, which lasts REMEMBER_DAYS.
// ---------------------------------------------------------------------------

export async function rememberDevice(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {}
): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await query(
    `INSERT INTO trusted_devices
       (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [
      userId,
      hashToken(token),
      String(REMEMBER_DAYS),
      meta.userAgent ?? null,
      meta.ip ?? null,
    ]
  );

  return token;
}

/**
 * True when this browser may skip the emailed code. The token must belong to
 * the account being signed into, so a device trusted for one user doesn't
 * unlock another.
 */
export async function isDeviceTrusted(
  userId: string,
  token: string | undefined
): Promise<boolean> {
  if (!token) return false;

  const row = await queryOne<{ id: string }>(
    `SELECT id FROM trusted_devices
      WHERE token_hash = $2
        AND user_id = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [userId, hashToken(token)]
  );

  if (!row) return false;

  query(`UPDATE trusted_devices SET last_used_at = now() WHERE id = $1`, [
    row.id,
  ]).catch(() => {});

  return true;
}

export async function revokeDevice(token: string): Promise<void> {
  await query(
    `UPDATE trusted_devices SET revoked_at = now() WHERE token_hash = $1`,
    [hashToken(token)]
  );
}

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REMEMBER_DAYS * 24 * 60 * 60,
  };
}

export const REMEMBER_WINDOW_DAYS = REMEMBER_DAYS;

// ---------------------------------------------------------------------------
// Login throttling
// ---------------------------------------------------------------------------

export async function noteFailedLogin(userId: string): Promise<void> {
  await query(
    `UPDATE users
        SET failed_login_count = failed_login_count + 1,
            locked_until = CASE
              WHEN failed_login_count + 1 >= $2
              THEN now() + ($3 || ' minutes')::interval
              ELSE locked_until
            END
      WHERE id = $1`,
    [userId, MAX_FAILED_LOGINS, String(LOCKOUT_MINUTES)]
  );
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await query(
    `UPDATE users
        SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
      WHERE id = $1`,
    [userId]
  );
}
