"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

interface Props {
  companyId: string;
  companyName: string;
}

type PendingAction = { kind: "approve" } | { kind: "reject"; reason: string };

export function RegistrationActions({ companyId, companyName }: Props) {
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [showSudo, setShowSudo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: PendingAction) => {
    setError(null);
    setPendingAction(action);
    start(async () => {
      const url =
        action.kind === "approve"
          ? `/api/owner/registrations/${companyId}/approve`
          : `/api/owner/registrations/${companyId}/reject`;
      const body =
        action.kind === "approve" ? {} : { reason: action.reason };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setRejectOpen(false);
        setReason("");
        setPendingAction(null);
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
      setError(json?.message || "Action fehlgeschlagen.");
      setPendingAction(null);
    });
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run({ kind: "approve" })}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-habb-success px-3 py-1.5 text-xs font-medium text-white hover:bg-habb-success/90 disabled:opacity-60"
        >
          {pending && pendingAction?.kind === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Approve
        </button>
        <button
          type="button"
          onClick={() => setRejectOpen(true)}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-1.5 text-xs font-medium text-habb-red hover:bg-habb-red/10 disabled:opacity-60"
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </button>
      </div>

      {rejectOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
          onClick={(e) => e.target === e.currentTarget && setRejectOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
              <h2 className="text-sm font-semibold text-habb-ink">
                Registrierung von {companyName} ablehnen
              </h2>
              <button
                onClick={() => setRejectOpen(false)}
                aria-label="Cancel"
                className="text-habb-muted hover:text-habb-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim().length < 10) {
                  setError("Begründung muss mindestens 10 Zeichen lang sein.");
                  return;
                }
                run({ kind: "reject", reason });
              }}
              className="space-y-4 px-5 py-5"
              noValidate
            >
              <p className="text-sm text-habb-ink">
                Reason will be sent to applicant via email.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="z.B. Konnten die Identität nicht verifizieren — bitte mit Handelsregisterauszug erneut versuchen."
                className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
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
                  onClick={() => setRejectOpen(false)}
                  className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-md bg-habb-red px-4 py-2 text-sm font-medium text-white hover:bg-habb-red-dark disabled:opacity-60"
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Reject
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
          if (pendingAction) run(pendingAction);
        }}
        actionLabel={
          pendingAction?.kind === "approve"
            ? `${companyName} freigeben`
            : `${companyName} ablehnen`
        }
      />
    </>
  );
}
