"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resetParameterToDefault, updateParameter } from "./actions";
import { computePreview, type PreviewResult } from "./preview";

export interface ParameterDialogData {
  key: string;
  label: string;
  description: string | null;
  unit: string | null;
  currentValue: string;
  defaultValue: string;
  minValue: string | null;
  maxValue: string | null;
  step: string | null;
  valueType: string;
  /** All other parameters' current values — needed for live preview. */
  allRows: { key: string; currentValue: string }[];
}

export function ParameterEditDialog({
  param,
  onClose,
}: {
  param: ParameterDialogData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newValue, setNewValue] = useState(param.currentValue);
  const [reason, setReason] = useState("");

  // Recompute the preview synchronously while the user types. Cheap because
  // the helper is pure and operates on the loaded rows.
  const preview: PreviewResult | null = useMemo(() => {
    if (!newValue || newValue === param.currentValue) return null;
    try {
      return computePreview({
        paramKey: param.key,
        rows: param.allRows,
        newValue,
      });
    } catch {
      return null;
    }
  }, [newValue, param.key, param.currentValue, param.allRows]);

  // Lock background scroll while open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        await updateParameter({ key: param.key, newValue, reason });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler");
      }
    });
  };

  const reset = () => {
    if (!confirm(`„${param.label}" auf Default ${param.defaultValue}${param.unit ?? ""} zurücksetzen?`)) {
      return;
    }
    const r = prompt("Begründung für Reset (Pflicht):");
    if (!r || r.trim().length < 3) {
      alert("Begründung mit mindestens 3 Zeichen ist Pflicht.");
      return;
    }
    start(async () => {
      try {
        await resetParameterToDefault({ key: param.key, reason: r });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler");
      }
    });
  };

  const isNumeric = ["NUMBER", "INTEGER", "DECIMAL", "DURATION_MIN", "TEMPERATURE_C", "PERCENTAGE", "CURRENCY_CHF"].includes(param.valueType);
  const stepValue = param.step ? Number(param.step) : isNumeric ? 0.1 : undefined;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-lg max-h-[85vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div className="flex-1">
            <CardTitle className="text-base">{param.label}</CardTitle>
            <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
              {param.key}
            </p>
            {param.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {param.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Aktuell</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono">
                {param.currentValue}
                {param.unit && <span className="ml-1 text-muted-foreground">{param.unit}</span>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Default</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono text-muted-foreground">
                {param.defaultValue}
                {param.unit && <span className="ml-1">{param.unit}</span>}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Neuer Wert</Label>
            <div className="flex items-center gap-2">
              <Input
                type={isNumeric ? "number" : "text"}
                step={stepValue}
                min={param.minValue ?? undefined}
                max={param.maxValue ?? undefined}
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="font-mono"
                autoFocus
              />
              {param.unit && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {param.unit}
                </span>
              )}
            </div>
            {(param.minValue || param.maxValue) && (
              <p className="text-xs text-muted-foreground">
                Bereich: {param.minValue ?? "—"} – {param.maxValue ?? "—"}
              </p>
            )}
          </div>

          {preview && (
            <div className="rounded-lg border border-habb-line bg-habb-paper px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">{preview.sample}</div>
              <div className="font-medium text-habb-ink mt-0.5">
                {preview.summary}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Begründung *</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z. B. Neuer Pulverlieferant XY-Polyester, schneller Brennvorgang lt. Datenblatt"
            />
            <p className="text-xs text-muted-foreground">
              Wird im Audit-Log gespeichert.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-between items-center pt-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={pending || param.currentValue === param.defaultValue}
              title="Auf Default zurücksetzen"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Default
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                onClick={submit}
                disabled={
                  pending ||
                  newValue === param.currentValue ||
                  reason.trim().length < 3
                }
              >
                Übernehmen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
