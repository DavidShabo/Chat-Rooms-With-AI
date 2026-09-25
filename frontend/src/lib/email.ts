/**
 * Outbound mail.
 *
 * With RESEND_API_KEY set, mail goes out over Resend's HTTP API (no SMTP
 * library needed). Without it, the message is written to the server console
 * so the signup flow is testable before you have a mail provider.
 *
 * To swap providers, replace send() — nothing else imports the transport.
 */

type Message = {
  to: string;
  subject: string;
  text: string;
};

/** False when no provider is configured, so callers can fall back. */
export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Safe to show the code in the response only when there's no mail provider
 * AND we're not in production — otherwise anyone could verify any address.
 */
export function canRevealCode(): boolean {
  return !mailConfigured() && process.env.NODE_ENV !== "production";
}

async function send(message: Message): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM ?? "Pixi <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(
      `\n┌─ [mail:dev] no RESEND_API_KEY — not actually sent\n` +
        `│  to: ${message.to}\n` +
        `│  ${message.subject}\n` +
        `└─────────────────────────────────────────────\n`
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mail send failed (${response.status}). ${detail.slice(0, 200)}`);
  }
}

export async function sendVerificationCode(
  to: string,
  code: string
): Promise<void> {
  await send({
    to,
    subject: `${code} is your Pixi verification code`,
    text: [
      `Your Pixi verification code is ${code}.`,
      "",
      "It expires in 10 minutes.",
      "If you didn't try to sign in, you can ignore this message.",
    ].join("\n"),
  });
}
