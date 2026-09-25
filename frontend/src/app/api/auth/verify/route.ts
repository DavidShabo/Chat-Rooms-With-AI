import { NextResponse } from "next/server";

import {
  consumeCode,
  createSession,
  DEVICE_COOKIE,
  deviceCookieOptions,
  normalizeEmail,
  rememberDevice,
  SESSION_COOKIE,
  sessionCookieOptions,
  type CodePurpose,
} from "@/lib/auth";
import { describeDbError, query, queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = { id: string; email_verified_at: string | null };

export async function POST(request: Request) {
  try {
    return await verify(request);
  } catch (error) {
    console.error("[auth/verify]", error);
    const dbProblem = describeDbError(error);
    return Response.json(
      { error: dbProblem ?? "Something went wrong." },
      { status: dbProblem ? 503 : 500 }
    );
  }
}

async function verify(request: Request) {
  let body: {
    email?: string;
    code?: string;
    purpose?: string;
    remember?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? "");
  const code = (body.code ?? "").trim();

  if (!email || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }

  const user = await queryOne<UserRow>(
    `SELECT id, email_verified_at FROM users WHERE lower(email) = $1`,
    [email]
  );

  if (!user) {
    return Response.json({ error: "That code isn't valid." }, { status: 400 });
  }

  // An unverified account is always finishing signup, whatever the client
  // claims; otherwise this is the per-login check.
  const purpose: CodePurpose = user.email_verified_at
    ? "login_mfa"
    : "email_verify";

  const result = await consumeCode(user.id, code, purpose);

  if (result === "too_many_attempts") {
    return Response.json(
      { error: "Too many attempts. Request a new code." },
      { status: 429 }
    );
  }
  if (result === "expired") {
    return Response.json(
      { error: "That code expired. Request a new one." },
      { status: 400 }
    );
  }
  if (result === "invalid") {
    return Response.json({ error: "That code isn't valid." }, { status: 400 });
  }

  if (!user.email_verified_at) {
    await query(
      `UPDATE users SET email_verified_at = now() WHERE id = $1`,
      [user.id]
    );
  }

  const meta = {
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for"),
  };

  const token = await createSession(user.id, meta);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

  if (body.remember === true) {
    const deviceToken = await rememberDevice(user.id, meta);
    response.cookies.set(DEVICE_COOKIE, deviceToken, deviceCookieOptions());
  }

  return response;
}
