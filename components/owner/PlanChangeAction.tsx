"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

type Plan = "TRIAL" | "TIME_ONLY" | "STARTER" | "PRO" | "ENTERPRISE";

interface TenantRow {
  id: string;
  name: string;
  plan: string;
  suspended: boolean;
}

const PLAN_OPTIONS: { value: Plan; label: string }[] = [
  { value: "TRIAL", label: "Trial — Pilot / kostenlos" },
  { value: "TIME_ONLY", label: "Zeiterfassung — nur Stempeluhr (CHF 29)" },
  { value: "STARTER", label: "Starter — bis 10 Mitarbeitende" },
  { value: "PRO", label: "Pro — Scheduler + Reports" },
  { value: "ENTERPRISE", label: "Enterprise — Custom + SLA" },
];

/** Plan-Wechsel-Modal pro Tenant. Sudo + Begründung, Audit. */
export function PlanChangeAction({ tenant }: { tenant: TenantRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>(tenant.plan as Plan);
  const [reason, setReason] = useState("");
  const [showSudo, setShowSudo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setOpen(false);
    setPlan(tenant.plan as Plan);
    setReason("");
    setError(null);
    setShowSudo(false);
  }

  function submit() {
    if (plan === tenant.plan) {
      setError("Bitte einen anderen Plan wählen.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Begründung mit mindestens 10 Zeichen ist Pflicht.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/owner/tenants/${tenant.id}/plan`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, reason }),
      });
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
          return;
        }
      }
      if (!res.ok) {
        setError("Plan-Wechsel fehlgeschlagen.");
        return;
      }
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={tenant.suspended}
        className="rounded-md border border-habb-line bg-white px-2.5 py-1 text-[11px] font-medium text-habb-ink hover:bg-habb-paper disabled:opacity-50 disabled:cursor-not-allowed"
        title={tenant.suspended ? "Suspendierte Tenanten erst reaktivieren" : "Change plan"}
      >
        Change plan
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
          onClick={(e) => e.target === e.currentTarget && reset()}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl"
          >
            <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
              <h2 className="text-sm font-semibold text-habb-ink">
                Change plan — {tenant.name}
              </h2>
              <button
                type="button"
                onClick={reset}
                aria-label="Schliessen"
                className="text-habb-muted hover:text-habb-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-4 px-5 py-5">
              <p className="text-sm text-habb-muted">
                Current plan: <span className="font-medium text-habb-ink">{tenant.plan}</span>.
                Die plan-gesteuerten Module passen sich beim Wechsel an. Manuelle
                Sonderfreischaltungen/-sperren und bestehende Daten bleiben unangetastet.
              </p>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
                  New plan
                </label>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as Plan)}
                  className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm"
                >
                  {PLAN_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
                  Begründung (Pflicht, ≥ 10 Zeichen)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm"
                  placeholder="z.B. Upgrade auf Pro — Vertrag #2026-014"
                />
              </div>

              {error && (
                <p className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red-dark">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Switch plan
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          submit();
        }}
        actionLabel={`Plan von ${tenant.name} ändern`}
      />
    </>
  );
}
