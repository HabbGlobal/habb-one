"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, X, AlertTriangle } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

interface Props {
  tenantId: string;
  tenantName: string;
}

/**
 * UNWIDERRUFLICHE Mandanten-Löschung. Nur sichtbar wenn der Mandant
 * bereits suspendiert ist (Server erzwingt das zusätzlich). OWNER_ROOT
 * + Sudo + Begründung; der Server prüft alles erneut.
 */
export function DeleteTenantButton({ tenantId, tenantName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSudo, setShowSudo] = useState(false);
  const [pending, start] = useTransition();

  const submit = (reasonText: string) => {
    if (reasonText.trim().length < 10) {
      setError("Begründung muss mindestens 10 Zeichen lang sein.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/owner/tenants/${tenantId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reasonText }),
      });
      if (res.ok) {
        setOpen(false);
        // Mandant existiert nicht mehr — zurück zur Übersicht.
        router.push("/owner/tenants");
        router.refresh();
        return;
      }
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
          return;
        }
      }
      const json = await res.json().catch(() => ({}));
      const map: Record<string, string> = {
        NOT_SUSPENDED:
          "Mandant muss zuerst suspendiert werden, bevor er gelöscht werden kann.",
        NOT_FOUND: "Mandant nicht gefunden.",
        UNAUTHORIZED: "Keine Berechtigung (OWNER_ROOT erforderlich).",
      };
      const msg =
        map[json?.error] ||
        (json?.error === "DELETE_FAILED" && json?.message
          ? `Löschung fehlgeschlagen: ${json.message}`
          : json?.message) ||
        "Löschung fehlgeschlagen.";
      setError(msg);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-habb-red/40 bg-habb-red/5 px-3 py-1.5 text-xs font-medium text-habb-red hover:bg-habb-red/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Endgültig löschen
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-habb-black/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
              <h2 className="text-sm font-semibold text-habb-red">
                Mandant unwiderruflich löschen
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Abbrechen"
                className="text-habb-muted hover:text-habb-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit(reason);
              }}
              className="space-y-4 px-5 py-5"
              noValidate
            >
              <div className="flex gap-2 rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2.5 text-sm text-habb-red">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  <strong>{tenantName}</strong> wird mit{" "}
                  <strong>allen Daten</strong> (Kunden, Aufträge, Offerten,
                  Rechnungen, Mitarbeitende, Zeiterfassung) und{" "}
                  <strong>allen Benutzerkonten</strong> endgültig entfernt.
                  Das kann <strong>nicht rückgängig</strong> gemacht werden.
                </p>
              </div>
              <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
                Begründung (Pflicht, ≥ 10 Zeichen)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
                placeholder="z.B. Vertragsende + DSG-Löschauftrag — Ticket #1234"
              />
              {error && (
                <p
                  aria-live="polite"
                  className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
                >
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-md bg-habb-red px-4 py-2 text-sm font-medium text-white hover:bg-habb-red-dark disabled:opacity-60"
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Unwiderruflich löschen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          submit(reason);
        }}
        actionLabel="Mandant löschen"
      />
    </>
  );
}
