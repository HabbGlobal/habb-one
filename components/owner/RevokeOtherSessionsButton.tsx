"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

/**
 * Beendet alle anderen Owner-Sessions (außer der aktuell verwendeten).
 * Owner muss aktuelles Passwort bestätigen — verhindert, dass ein
 * unbefugter Browser-Tab fremde Sessions kicken kann.
 */
export function RevokeOtherSessionsButton({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    start(async () => {
      const res = await fetch("/api/owner/auth/revoke-other-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error === "WRONG_PASSWORD"
            ? "Passwort ist falsch."
            : "Action fehlgeschlagen.",
        );
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
      >
        <LogOut className="h-3.5 w-3.5" />
        End other sessions ({count})
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={onConfirm}
            className="w-full max-w-sm rounded-lg border border-habb-line bg-white p-5 shadow-lg"
          >
            <h3 className="text-base font-semibold text-habb-black">
              End other sessions
            </h3>
            <p className="mt-1 text-sm text-habb-muted">
              Bestätige mit deinem aktuellen Passwort. Alle {count} anderen
              Sitzungen werden sofort abgemeldet — diese hier bleibt aktiv.
            </p>

            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-habb-muted">
              Current password
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              autoFocus
              className="mt-1 block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
            />

            {error && (
              <p className="mt-2 text-xs text-habb-red-dark">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-muted hover:text-habb-ink"
              >Cancel</button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md bg-habb-red px-3 py-1.5 text-xs font-medium text-white hover:bg-habb-red-dark disabled:opacity-60"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                End sessions
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
