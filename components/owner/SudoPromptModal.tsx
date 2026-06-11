"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";

interface SudoPromptProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Aktion, die gleich ausgeführt wird — wird als Kontext angezeigt. */
  actionLabel: string;
}

/**
 * Step-up Auth Modal. Owner gibt sein Passwort nochmal ein; bei Erfolg
 * läuft `onSuccess()` und die ursprüngliche destruktive Aktion kann
 * wiederholt werden (Server gewährt jetzt Sudo).
 *
 * Wirft Fokus-Trap nicht aktiv ein — die Modal-Komponente ist klein,
 * Tab-Reihenfolge ist eindeutig. Esc + Click-Outside schliessen.
 */
export function SudoPromptModal({ open, onClose, onSuccess, actionLabel }: SudoPromptProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      return;
    }
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    start(async () => {
      const res = await fetch("/api/owner/sudo/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError("Passwort ist nicht korrekt.");
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sudo-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-habb-black/30 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
        <header className="flex items-center gap-3 border-b border-habb-line px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-habb-red/10">
            <ShieldAlert className="h-4 w-4 text-habb-red" />
          </span>
          <div className="flex-1">
            <h2 id="sudo-prompt-title" className="text-sm font-semibold text-habb-ink">
              Step-up Bestätigung
            </h2>
            <p className="text-xs text-habb-muted">{actionLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Abbrechen"
            className="text-habb-muted hover:text-habb-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-5" noValidate>
          <p className="text-sm text-habb-ink">
            Bitte gib dein Owner-Passwort erneut ein. Der Sudo-Modus bleibt anschliessend 5 Minuten aktiv.
          </p>
          <input
            ref={inputRef}
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="block w-full rounded-lg border border-habb-line bg-white px-4 py-3 text-base focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
          />
          {error && (
            <p
              aria-live="polite"
              className="rounded-lg border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Bestätigen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
