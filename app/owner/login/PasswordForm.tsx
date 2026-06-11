"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function PasswordForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    start(async () => {
      const res = await fetch("/api/owner/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const json = (await res.json()) as { next: "enroll" | "signin" };
        router.push(json.next === "enroll" ? "/owner/enroll-passkey" : "/owner/login/passkey");
      } else {
        setError("E-Mail oder Passwort ist nicht korrekt.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="owner-email" className="block text-sm font-medium text-habb-ink">
          E-Mail
        </label>
        <input
          id="owner-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          required
          className="block w-full rounded-lg border border-habb-line bg-white px-4 py-3.5 text-base text-habb-ink placeholder:text-habb-muted/60 focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="owner-password" className="block text-sm font-medium text-habb-ink">
          Passwort
        </label>
        <div className="relative">
          <input
            id="owner-password"
            name="password"
            type={showPwd ? "text" : "password"}
            autoComplete="current-password"
            required
            className="block w-full rounded-lg border border-habb-line bg-white px-4 py-3.5 pr-12 text-base text-habb-ink placeholder:text-habb-muted/60 focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? "Passwort verbergen" : "Passwort anzeigen"}
            aria-pressed={showPwd}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-habb-muted hover:text-habb-ink focus-visible:text-habb-ink focus-visible:outline-none"
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-habb-red/30 bg-habb-red/5 px-3.5 py-2.5 text-sm text-habb-red"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-habb-black px-5 py-3.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-habb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Weiter
      </button>

      <p className="text-center text-xs text-habb-muted">
        Bei Verdacht auf Missbrauch:{" "}
        <a
          href="mailto:security@habb.ch"
          className="text-habb-ink underline-offset-2 hover:underline"
        >
          security@habb.ch
        </a>
      </p>
    </form>
  );
}
