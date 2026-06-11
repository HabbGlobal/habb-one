"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    start(async () => {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.replace("/login"), 1500);
      } else {
        const json = await res.json().catch(() => ({}));
        setError(json?.message || "Passwort konnte nicht geändert werden.");
      }
    });
  };

  if (success) {
    return (
      <div className="rounded-lg border border-habb-success/30 bg-habb-success/5 px-4 py-3 text-sm text-habb-success">
        Passwort wurde aktualisiert. Sie werden weitergeleitet …
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="rp-password" className="block text-sm font-medium text-habb-ink">
          Neues Passwort
        </label>
        <div className="relative">
          <input
            id="rp-password"
            name="password"
            type={showPwd ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            className="block w-full rounded-lg border border-habb-line bg-white px-4 py-3.5 pr-12 text-base focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            aria-label={showPwd ? "Passwort verbergen" : "Passwort anzeigen"}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-habb-muted hover:text-habb-ink"
          >
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-habb-muted">Mindestens 8 Zeichen.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="rp-confirm" className="block text-sm font-medium text-habb-ink">
          Bestätigen
        </label>
        <input
          id="rp-confirm"
          name="confirm"
          type={showPwd ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          className="block w-full rounded-lg border border-habb-line bg-white px-4 py-3.5 text-base focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
        />
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
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-habb-black px-5 py-3.5 text-base font-medium text-white hover:bg-habb-ink disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Passwort speichern
      </button>
    </form>
  );
}
