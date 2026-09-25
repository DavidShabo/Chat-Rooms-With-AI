"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { PixiLogo } from "@/components/pixi-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "verify";

export function AuthForm({ initialMode = "signin" }: { initialMode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "verify") codeRef.current?.focus();
  }, [mode]);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function post(path: string, payload: Record<string, unknown>) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "signup") {
        const { ok, data } = await post("/api/auth/register", {
          email,
          password,
          displayName,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        if (!ok) {
          setError(data.error ?? "Could not create the account.");
          return;
        }
        switchTo("verify");
        if (data.devCode) {
          setCode(data.devCode);
          setNotice(
            `No mail provider configured — your code is ${data.devCode} (filled in below).`
          );
        } else {
          setNotice(data.warning ?? `We sent a 6-digit code to ${email}.`);
        }
        return;
      }

      if (mode === "signin") {
        const { ok, data } = await post("/api/auth/login", {
          email,
          password,
        });

        // A remembered device signs straight in.
        if (ok) {
          router.push("/");
          router.refresh();
          return;
        }

        // Password was right but a code is needed — either to finish signup
        // or to confirm this sign-in.
        if (data.next === "verify") {
          switchTo("verify");
          if (data.devCode) {
            setCode(data.devCode);
            setNotice(
              `No mail provider configured — your code is ${data.devCode} (filled in below).`
            );
          } else {
            setNotice(data.message ?? `We sent a code to ${email}.`);
          }
          return;
        }

        setError(data.error ?? "Could not sign in.");
        return;
      }

      // verify
      const { ok, data } = await post("/api/auth/verify", {
        email,
        code,
        remember,
      });
      if (!ok) {
        setError(data.error ?? "That code isn't valid.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Is it running?");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await post("/api/auth/resend", { email });
      if (data.devCode) {
        setCode(data.devCode);
        setNotice(
          `No mail provider configured — your code is ${data.devCode} (filled in below).`
        );
      } else {
        setNotice(`We sent another code to ${email}.`);
      }
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "signin"
      ? "Sign in to Pixi"
      : mode === "signup"
        ? "Create your account"
        : "Confirm it's you";

  const subheading =
    mode === "verify"
      ? `Enter the 6-digit code we sent to ${email}.`
      : mode === "signup"
        ? "Your assistant for tasks, calendar and email."
        : "Welcome back.";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <PixiLogo className="mb-4 size-10" />
          <h1 className="text-xl font-medium tracking-tight">{heading}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{subheading}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "verify" ? (
            <>
              <Field label="Verification code">
                <input
                  ref={codeRef}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className={inputClass("text-center text-lg tracking-[0.5em]")}
                />
              </Field>

              <label className="flex cursor-pointer items-start gap-2.5 py-1">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={remember}
                  onClick={() => setRemember((prev) => !prev)}
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                    remember
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40 hover:border-primary"
                  )}
                >
                  {remember && <Check className="size-3" strokeWidth={3} />}
                </button>
                <span className="text-xs leading-snug">
                  Remember this device
                  <span className="text-muted-foreground block text-[0.7rem]">
                    Skip the code on this browser for 7 days.
                  </span>
                </span>
              </label>

              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy && <Loader2 className="animate-spin" />}
                Verify and continue
              </Button>

              <div className="mt-1 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => switchTo("signin")}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="size-3" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={busy}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </>
          ) : (
            <>
              {mode === "signup" && (
                <Field label="Name">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    placeholder="David Shabo"
                    className={inputClass()}
                  />
                </Field>
              )}

              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className={inputClass()}
                />
              </Field>

              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  required
                  placeholder="••••••••••"
                  className={inputClass()}
                />
                {mode === "signup" && (
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    At least 10 characters, with a letter and a number.
                  </p>
                )}
              </Field>

              <Button type="submit" disabled={busy} className="mt-1">
                {busy && <Loader2 className="animate-spin" />}
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>

              <p className="text-muted-foreground mt-2 text-center text-xs">
                {mode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchTo("signin")}
                      className="text-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    New here?{" "}
                    <button
                      type="button"
                      onClick={() => switchTo("signup")}
                      className="text-primary hover:underline"
                    >
                      Create an account
                    </button>
                  </>
                )}
              </p>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive mt-1 rounded-lg border px-3 py-2 text-xs"
            >
              {error}
            </p>
          )}

          {notice && !error && (
            <p className="border-border bg-card text-muted-foreground mt-1 rounded-lg border px-3 py-2 text-xs">
              {notice}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

function inputClass(extra?: string) {
  return cn(
    "bg-card border-border focus:border-primary/60 placeholder:text-muted-foreground",
    "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors",
    extra
  );
}
