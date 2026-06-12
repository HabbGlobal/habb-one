"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, X } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

interface Props {
  tenantId: string;
  isSuspended: boolean;
}

export function SuspendButtons({ tenantId, isSuspended }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSudo, setShowSudo] = useState(false);
  const [pending, start] = useTransition();

  const action = isSuspended ? "reactivate" : "suspend";
  const actionLabel = isSuspended ? "Reactivate" : "Suspend";

  const submit = (reasonText: string) => {
    if (reasonText.trim().length < 10) {
      setError("Reason must be at least 10 characters long.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/owner/tenants/${tenantId}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reasonText }),
      });
      if (res.ok) {
        setOpen(false);
        setReason("");
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
      setError(json?.message || "Action failed.");
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          isSuspended
            ? "inline-flex items-center gap-1.5 rounded-md border border-habb-success/30 bg-habb-success/5 px-3 py-1.5 text-xs font-medium text-habb-success hover:bg-habb-success/10"
            : "inline-flex items-center gap-1.5 rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-1.5 text-xs font-medium text-habb-red hover:bg-habb-red/10"
        }
      >
        {isSuspended ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {actionLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-habb-black/30 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
              <h2 className="text-sm font-semibold text-habb-ink">Tenant{actionLabel.toLowerCase()}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cancel"
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
              <p className="text-sm text-habb-ink">
                {isSuspended
                  ? "The tenant will be able to log in again at the customer login."
                  : "The tenant will no longer be able to log in at the customer login until you reactivate them."}
              </p>
              <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
                Reason (required, ≥ 10 characters)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
                placeholder={
                  isSuspended
                    ? "e.g. Clarification with fiduciary completed — Ticket #1234"
                    : "e.g. Repeated payment default — Ticket #1234"
                }
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
                >Cancel</button>
                <button
                  type="submit"
                  disabled={pending}
                  className={
                    isSuspended
                      ? "inline-flex items-center gap-2 rounded-md bg-habb-success px-4 py-2 text-sm font-medium text-white hover:bg-habb-success/90 disabled:opacity-60"
                      : "inline-flex items-center gap-2 rounded-md bg-habb-red px-4 py-2 text-sm font-medium text-white hover:bg-habb-red-dark disabled:opacity-60"
                  }
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirm
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
        actionLabel={`Tenant ${actionLabel.toLowerCase()}`}
      />
    </>
  );
}
