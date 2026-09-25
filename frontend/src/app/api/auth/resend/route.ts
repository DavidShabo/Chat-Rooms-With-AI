import { issueCode, normalizeEmail } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { canRevealCode, sendVerificationCode } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = { id: string; email: string; email_verified_at: string | null };

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const email = normalizeEmail(body.email ?? "");
  if (!email) {
    return Response.json({ error: "Email is required." }, { status: 400 });
  }

  const user = await queryOne<UserRow>(
    `SELECT id, email, email_verified_at FROM users WHERE lower(email) = $1`,
    [email]
  );

  // Always report success — a different answer for unknown addresses would
  // let someone probe which emails have accounts.
  if (user) {
    // Match whatever step they're actually on.
    const purpose = user.email_verified_at ? "login_mfa" : "email_verify";
    const code = await issueCode(user.id, purpose);
    await sendVerificationCode(user.email, code).catch((error) =>
      console.error("[auth/resend] mail failed", error)
    );
    return Response.json({
      ok: true,
      devCode: canRevealCode() ? code : undefined,
    });
  }

  return Response.json({ ok: true });
}
