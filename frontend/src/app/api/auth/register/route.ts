import {
  emailLooksValid,
  hashPassword,
  issueCode,
  normalizeEmail,
  passwordProblem,
} from "@/lib/auth";
import { describeDbError, queryOne } from "@/lib/db";
import { canRevealCode, sendVerificationCode } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = { id: string; email_verified_at: string | null };

export async function POST(request: Request) {
  try {
    return await register(request);
  } catch (error) {
    console.error("[auth/register]", error);
    const dbProblem = describeDbError(error);
    return Response.json(
      { error: dbProblem ?? "Something went wrong." },
      { status: dbProblem ? 503 : 500 }
    );
  }
}

async function register(request: Request) {
  let body: {
    email?: string;
    password?: string;
    displayName?: string;
    timezone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  const displayName = body.displayName?.trim() || null;

  if (!emailLooksValid(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const problem = passwordProblem(password);
  if (problem) {
    return Response.json({ error: problem }, { status: 400 });
  }

  const existing = await queryOne<UserRow>(
    `SELECT id, email_verified_at FROM users WHERE lower(email) = $1`,
    [email]
  );

  if (existing) {
    // Don't confirm or deny that the address is registered — that turns this
    // endpoint into an account-enumeration oracle. Unverified accounts still
    // get a fresh code so a half-finished signup can be completed.
    if (!existing.email_verified_at) {
      const code = await issueCode(existing.id);
      await sendVerificationCode(email, code);
      return Response.json(
        { ok: true, next: "verify", devCode: canRevealCode() ? code : undefined },
        { status: 202 }
      );
    }
    return Response.json({ ok: true, next: "verify" }, { status: 202 });
  }

  const passwordHash = await hashPassword(password);

  const created = await queryOne<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name, timezone)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [email, passwordHash, displayName, safeTimezone(body.timezone)]
  );

  if (!created) {
    return Response.json({ error: "Could not create the account." }, { status: 500 });
  }

  const code = await issueCode(created.id);

  try {
    await sendVerificationCode(email, code);
  } catch (error) {
    console.error("[auth/register] mail failed", error);
    // The account exists; let them ask for another code rather than
    // stranding them with no path forward.
    return Response.json(
      {
        ok: true,
        next: "verify",
        warning: "We couldn't send the email. Try resending.",
        devCode: canRevealCode() ? code : undefined,
      },
      { status: 202 }
    );
  }

  return Response.json(
    { ok: true, next: "verify", devCode: canRevealCode() ? code : undefined },
    { status: 201 }
  );
}

/** The browser supplies this, so treat it as untrusted input. */
function safeTimezone(value: string | undefined): string {
  const tz = value?.trim();
  if (tz && /^[A-Za-z]+\/[A-Za-z_+\-0-9/]+$/.test(tz)) return tz;
  return "UTC";
}
