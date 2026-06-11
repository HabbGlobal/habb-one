"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";

/**
 * Self-Service-Formular, mit dem der eingeloggte Owner sein Passwort
 * ändert. Current-Password ist Pflicht (Schutz gegen Session-Hijack);
 * der Server verifiziert es nochmal serverseitig.
 */
export function PasswordChangeForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get("currentPassword") ?? "");
    const newPassword = String(fd.get("newPassword") ?? "");
    const confirmPassword = String(fd.get("confirmPassword") ?? "");

    if (newPassword.length < 12) {
      setError("Neues Passwort muss mindestens 12 Zeichen lang sein.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Neues Passwort und Bestätigung stimmen nicht überein.");
      return;
    }

    const form = e.currentTarget;
    start(async () => {
      const res = await fetch("/api/owner/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error === "WRONG_PASSWORD"
            ? "Aktuelles Passwort ist falsch."
            : data?.error === "WEAK_PASSWORD"
              ? "Neues Passwort ist zu schwach."
              : "Ändern fehlgeschlagen. Bitte erneut versuchen.",
        );
        return;
      }
      form.reset();
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-md">
      <Field
        label="Aktuelles Passwort"
        name="currentPassword"
        autoComplete="current-password"
        required
      />
      <Field
        label="Neues Passwort"
        name="newPassword"
        autoComplete="new-password"
        required
        hint="Mindestens 12 Zeichen — gerne länger und ohne Muster."
      />
      <Field
        label="Neues Passwort bestätigen"
        name="confirmPassword"
        autoComplete="new-password"
        required
      />

      {error && (
        <p className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-xs text-habb-red-dark">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-habb-success/30 bg-habb-success/5 px-3 py-2 text-xs text-habb-success flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" /> Passwort wurde aktualisiert.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
      >
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Passwort ändern
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  autoComplete,
  required,
  hint,
}: {
  label: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-habb-muted">
        {label}
      </label>
      <input
        type="password"
        name={name}
        autoComplete={autoComplete}
        required={required}
        className="mt-1 block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
      />
      {hint && <p className="mt-1 text-[11px] text-habb-muted">{hint}</p>}
    </div>
  );
}
