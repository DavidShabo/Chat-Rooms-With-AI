import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  clearFailedLogins,
  createSession,
  DEVICE_COOKIE,
  hashPassword,
  isDeviceTrusted,
  issueCode,
  noteFailedLogin,
  normalizeEmail,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { describeDbError, queryOne } from "@/lib/db";
import { canRevealCode, sendVerificationCode } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  locked_until: string | null;
};

// Same message whether the address is unknown or the password is wrong —
// anything more specific tells an attacker which accounts exist.
const GENERIC = "Email or password is incorrect.";

export async function POST(request: Request) {
  try {
    return await login(request);
  } catch (error) {
    console.error("[auth/login]", error);
    const dbProblem = describeDbError(error);
    return Response.json(
      { error: dbProblem ?? "Something went wrong." },
      { status: dbProblem ? 503 : 500 }
    );
  }
}

async function login(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";

  if (!email || !password) {
    return Response.json({ error: GENERIC }, { status: 400 });
  }

  const user = await queryOne<UserRow>(
    `SELECT id, email, password_hash, email_verified_at, locked_until
       FROM users
      WHERE lower(email) = $1`,
    [email]
  );

  if (!user) {
    // Hash anyway so a missing account doesn't return measurably faster
    // than a wrong password.
    await hashPassword(password);
    return Response.json({ error: GENERIC }, { status: 401 });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return Response.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const ok = await verifyPassword(password, user.password_hash);

  if (!ok) {
    await noteFailedLogin(user.id);
    return Response.json({ error: GENERIC }, { status: 401 });
  }

  await clearFailedLogins(user.id);

  const meta = {
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  };

  // Never verified their address — that code comes first.
  if (!user.email_verified_at) {
    const code = await issueCode(user.id, "email_verify");
    await sendVerificationCode(user.email, code).catch((error) =>
      console.error("[auth/login] mail failed", error)
    );
    return Response.json(
      {
        next: "verify",
        purpose: "email_verify",
        message: "Verify your email first. We sent a code.",
        devCode: canRevealCode() ? code : undefined,
      },
      { status: 403 }
    );
  }

  // A browser that was remembered within the window skips the code.
  const store = await cookies();
  const deviceToken = store.get(DEVICE_COOKIE)?.value;

  if (await isDeviceTrusted(user.id, deviceToken)) {
    const token = await createSession(user.id, meta);
    const response = NextResponse.json({ ok: true, trusted: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  }

  // Otherwise the password alone isn't enough — send a code and stop here.
  // No session is created until it's confirmed.
  const code = await issueCode(user.id, "login_mfa");
  await sendVerificationCode(user.email, code).catch((error) =>
    console.error("[auth/login] mail failed", error)
  );

  return Response.json(
    {
      next: "verify",
      purpose: "login_mfa",
      message: "We sent a code to confirm it's you.",
      devCode: canRevealCode() ? code : undefined,
    },
    { status: 401 }
  );
}
