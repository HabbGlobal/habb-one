"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X } from "lucide-react";
import type { TenantModule } from "@prisma/client";
import { SudoPromptModal } from "./SudoPromptModal";
import { MODULE_DEFAULTS } from "@/lib/owner/entitlements";

export interface EntitlementRow {
  module: TenantModule;
  enabled: boolean;
  monthlyLimit: number | null;
  hasOverride: boolean;
  /** Does this module belong to the tenant's current plan? */
  inPlan: boolean;
}

interface EntitlementsListProps {
  tenantId: string;
  initial: EntitlementRow[];
}

export function EntitlementsList({ tenantId, initial }: EntitlementsListProps) {
  const router = useRouter();
  const [pendingModule, setPendingModule] = useState<TenantModule | null>(null);
  const [editingModule, setEditingModule] = useState<TenantModule | null>(null);
  const [reason, setReason] = useState("");
  const [pendingState, setPendingState] = useState<
    { module: TenantModule; enabled: boolean; monthlyLimit: number | null; reason: string } | null
  >(null);
  const [showSudo, setShowSudo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const submit = (
    module: TenantModule,
    enabled: boolean,
    monthlyLimit: number | null,
    reasonText: string,
  ) => {
    if (reasonText.trim().length < 10) {
      setError("Reason must be at least 10 characters long.");
      return;
    }
    setError(null);
    setPendingModule(module);

    const payload = { module, enabled, monthlyLimit, reason: reasonText };

    start(async () => {
      const res = await fetch(`/api/owner/tenants/${tenantId}/entitlements`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setPendingModule(null);
      if (res.ok) {
        setEditingModule(null);
        setReason("");
        router.refresh();
        return;
      }
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setPendingState(payload);
          setShowSudo(true);
          return;
        }
      }
      const json = await res.json().catch(() => ({}));
      setError(json?.message || "Save failed.");
    });
  };

  return (
    <section className="rounded-lg border border-habb-line bg-white">
      <header className="border-b border-habb-line px-5 py-3">
        <h2 className="text-sm font-medium text-habb-ink">Modules & Limits</h2>
        <p className="mt-0.5 text-xs text-habb-muted">
          By default, the <strong>Plan</strong> determines the modules. A plan change
          activates/deactivates them automatically. Here you can additionally
          override individual modules manually — these special cases <strong>are preserved even
          after a plan change</strong>. Changes take effect immediately and are audited.
        </p>
      </header>

      <ul className="divide-y divide-habb-line">
        {initial.map((row) => {
          const def = MODULE_DEFAULTS[row.module];
          const isEditing = editingModule === row.module;
          const isPending = pendingModule === row.module;
          return (
            <li key={row.module} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-habb-ink">{def.label}</h3>
                    <ProvenanceBadge row={row} />
                  </div>
                  <p className="mt-0.5 text-xs text-habb-muted">{def.description}</p>
                  <p className="mt-1.5 text-xs text-habb-ink">
                    <span className={row.enabled ? "text-habb-success" : "text-habb-red"}>
                      {row.enabled ? "Active" : "Deactivated"}
                    </span>
                    <span className="mx-2 text-habb-muted">·</span>
                    <span className="text-habb-muted">
                      Limit: {row.monthlyLimit === null ? "unlimited" : `${row.monthlyLimit} / month`}
                    </span>
                  </p>
                </div>
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingModule(row.module);
                      setError(null);
                      setReason("");
                    }}
                    disabled={isPending}
                    className="rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
                  >Edit</button>
                )}
              </div>

              {isEditing && (
                <EntitlementForm
                  row={row}
                  reason={reason}
                  setReason={setReason}
                  pending={isPending}
                  onCancel={() => {
                    setEditingModule(null);
                    setReason("");
                    setError(null);
                  }}
                  onSubmit={(enabled, monthlyLimit) =>
                    submit(row.module, enabled, monthlyLimit, reason)
                  }
                  error={error}
                />
              )}
            </li>
          );
        })}
      </ul>

      <SudoPromptModal
        open={showSudo}
        onClose={() => {
          setShowSudo(false);
          setPendingState(null);
        }}
        onSuccess={() => {
          setShowSudo(false);
          if (pendingState) {
            const p = pendingState;
            setPendingState(null);
            submit(p.module, p.enabled, p.monthlyLimit, p.reason);
          }
        }}
        actionLabel={
          pendingState
            ? `Change module "${MODULE_DEFAULTS[pendingState.module].label}"`
            : "Change module"
        }
      />
    </section>
  );
}

/**
 * Shows the provenance of the effective module state:
 *   - "Plan": comes from the plan, no manual deviation
 *   - "Manual +/−": Override deviates from plan (additionally enabled / blocked)
 *   - "Not in plan": neither in plan nor manually activated
 */
function ProvenanceBadge({ row }: { row: EntitlementRow }) {
  const deviates = row.hasOverride && row.enabled !== row.inPlan;
  if (deviates) {
    return (
      <span className="rounded-full border border-habb-warning/40 bg-habb-warning/10 px-1.5 text-[10px] font-medium uppercase tracking-wide text-habb-warning">
        {row.enabled ? "Manual +" : "Manual −"}
      </span>
    );
  }
  if (row.inPlan) {
    return (
      <span className="rounded-full border border-habb-success/30 bg-habb-success/10 px-1.5 text-[10px] uppercase tracking-wide text-habb-success">
        Plan
      </span>
    );
  }
  return (
    <span className="rounded-full border border-habb-line bg-habb-paper px-1.5 text-[10px] uppercase tracking-wide text-habb-muted">
      Not in plan
    </span>
  );
}

function EntitlementForm({
  row,
  reason,
  setReason,
  onCancel,
  onSubmit,
  pending,
  error,
}: {
  row: EntitlementRow;
  reason: string;
  setReason: (v: string) => void;
  onCancel: () => void;
  onSubmit: (enabled: boolean, monthlyLimit: number | null) => void;
  pending: boolean;
  error: string | null;
}) {
  const [enabled, setEnabled] = useState(row.enabled);
  const [limitMode, setLimitMode] = useState<"unlimited" | "limited">(
    row.monthlyLimit === null ? "unlimited" : "limited",
  );
  const [limit, setLimit] = useState(row.monthlyLimit ?? 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(enabled, limitMode === "unlimited" ? null : limit);
      }}
      className="mt-4 grid gap-4 rounded-lg border border-habb-line bg-habb-paper px-4 py-4 sm:grid-cols-2"
    >
      <label className="flex items-center gap-2 text-sm text-habb-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-habb-line"
        />
        Module activated
      </label>

      <div className="space-y-1.5">
        <span className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
          Limit / month
        </span>
        <div className="flex items-center gap-2">
          <select
            value={limitMode}
            onChange={(e) => setLimitMode(e.target.value as typeof limitMode)}
            className="rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
          >
            <option value="unlimited">Unlimited</option>
            <option value="limited">Set value ...</option>
          </select>
          {limitMode === "limited" && (
            <input
              type="number"
              min={0}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-24 rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
          Reason (required, ≥ 10 characters)
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Pro plan upgrade on customer request — Ticket #1234"
          className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
        />
      </div>

      {error && (
        <p
          aria-live="polite"
          className="sm:col-span-2 rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-sm font-medium text-habb-ink hover:bg-habb-paper"
        >
          <X className="h-3.5 w-3.5" />Cancel</button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-1.5 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save</button>
      </div>
    </form>
  );
}
