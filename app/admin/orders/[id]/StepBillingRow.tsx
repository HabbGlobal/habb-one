"use client";

// One table row per ProcessStep showing Estimated / Actual / Billable values,
// and editable inline for ADMIN users:
//
//   • Select the source (ACTUAL / ESTIMATED / MANUAL)
//   • Enter a minute value when MANUAL is selected
//
// Changes are persisted immediately via setStepBilling; the detail page
// is revalidated afterward.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  processLabel,
  machineLabel,
  skillLabel,
  stepStatusLabel,
} from "@/lib/order/labels";
import { setStepBilling } from "@/app/scan/[stepId]/actions";
import type { ProcessStepDTO } from "@/lib/dto/order";

const SOURCE_LABEL: Record<ProcessStepDTO["billingTimeSource"], string> = {
  ACTUAL:    "Actual (Scan)",
  ESTIMATED: "Estimate",
  MANUAL:    "Manual",
};

const SOURCE_VARIANT: Record<
  ProcessStepDTO["billingTimeSource"],
  "default" | "info" | "warning"
> = {
  ACTUAL:    "info",
  ESTIMATED: "default",
  MANUAL:    "warning",
};

function fmtMin(n: number | null): string {
  if (n == null) return "—";
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function StepBillingRow({
  step,
  canEdit,
}: {
  step: ProcessStepDTO;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(step.billingTimeSource);
  const [manualMinutes, setManualMinutes] = useState<number>(
    step.billedMinutes ?? step.estimatedMinutes,
  );

  const save = () => {
    setError(null);
    start(async () => {
      try {
        await setStepBilling({
          stepId: step.id,
          billingTimeSource: source,
          billedMinutes: source === "MANUAL" ? manualMinutes : undefined,
        });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const cancel = () => {
    setSource(step.billingTimeSource);
    setManualMinutes(step.billedMinutes ?? step.estimatedMinutes);
    setEditing(false);
    setError(null);
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded bg-muted/40 text-xs">
      <span className="col-span-1 font-mono tabular-nums text-muted-foreground">
        {step.sequence}
      </span>
      <span className="col-span-3 font-medium">{processLabel(step.processCode)}</span>
      <span className="col-span-1 text-muted-foreground">
        {skillLabel(step.skillRequired)}
      </span>
      <span className="col-span-1 text-muted-foreground">
        {machineLabel(step.machineTypeRequired)}
      </span>
      <span className="col-span-1 tabular-nums text-right text-muted-foreground">
        {fmtMin(step.estimatedMinutes)}
      </span>
      <span className="col-span-1 tabular-nums text-right">
        {step.actualMinutes != null ? (
          <span className="font-medium">{fmtMin(step.actualMinutes)}</span>
        ) : step.status === "IN_PROGRESS" ? (
          <span className="text-emerald-600 inline-flex items-center gap-1">
            <Clock className="h-3 w-3 animate-pulse" />
            running
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>

      {/* Billable (effective) — if not edited */}
      {!editing ? (
        <>
          <span className="col-span-1 tabular-nums text-right font-semibold text-emerald-700">
            {fmtMin(step.effectiveBilledMinutes)}
          </span>
          <span className="col-span-2 text-right">
            <Badge variant={SOURCE_VARIANT[step.billingTimeSource]} className="text-[10px]">
              {SOURCE_LABEL[step.billingTimeSource]}
              {step.billingTimeSource === "MANUAL" && step.billedMinutes != null && (
                <span className="ml-1">({step.billedMinutes})</span>
              )}
            </Badge>
          </span>
          <span className="col-span-1 text-right">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="p-1 rounded hover:bg-accent"
                aria-label="Edit billing"
                title="Edit billing"
              >
                <Pencil className="h-3 w-3" />
              </button>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                {stepStatusLabel(step.status)}
              </Badge>
            )}
          </span>
        </>
      ) : (
        <>
          {/* Editor — Source and optional minute override */}
          <span className="col-span-2">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as ProcessStepDTO["billingTimeSource"])}
              className="text-xs h-7"
            >
              <option value="ACTUAL">Actual (Scan)</option>
              <option value="ESTIMATED">Estimated</option>
              <option value="MANUAL">Manual</option>
            </Select>
          </span>
          <span className="col-span-1">
            {source === "MANUAL" && (
              <Input
                type="number"
                min={0}
                value={manualMinutes}
                onChange={(e) => setManualMinutes(Number(e.target.value))}
                className="text-xs h-7"
                placeholder="Min"
              />
            )}
          </span>
          <span className="col-span-1 flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={cancel}
              disabled={pending}
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              className="h-6 w-6 p-0"
              onClick={save}
              disabled={pending}
              title="Save"
            >
              <Check className="h-3 w-3" />
            </Button>
          </span>
        </>
      )}

      {error && (
        <span className="col-span-12 text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
