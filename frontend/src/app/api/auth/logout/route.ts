import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  DEVICE_COOKIE,
  revokeDevice,
  revokeSession,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const deviceToken = store.get(DEVICE_COOKIE)?.value;

  if (token) await revokeSession(token);

  // Signing out deliberately forgets the device too, so the next sign-in
  // asks for a code. "Remember me" is about convenience between sessions,
  // not a way to permanently disable the check.
  let forgetDevice = false;
  try {
    const body = await request.json();
    forgetDevice = body?.forgetDevice !== false;
  } catch {
    forgetDevice = true;
  }

  if (deviceToken && forgetDevice) {
    await revokeDevice(deviceToken);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  if (forgetDevice) {
    response.cookies.set(DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return response;
}
