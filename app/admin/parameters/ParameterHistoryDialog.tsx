"use client";

import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface HistoryEntry {
  id: string;
  oldValue: string;
  newValue: string;
  reason: string;
  changedBy: string;
  effectiveAt: Date;
}

export function ParameterHistoryDialog({
  paramKey,
  paramLabel,
  unit,
  history,
  onClose,
}: {
  paramKey: string;
  paramLabel: string;
  unit: string | null;
  history: HistoryEntry[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-2xl max-h-[80vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Änderungsverlauf</CardTitle>
            <p className="text-sm text-muted-foreground">{paramLabel}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{paramKey}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Änderungen.</p>
          ) : (
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.id} className="py-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-mono">
                      <span className="text-muted-foreground">{h.oldValue}</span>
                      <span className="mx-2">→</span>
                      <span className="font-semibold">{h.newValue}</span>
                      {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {new Intl.DateTimeFormat("de-CH", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(h.effectiveAt)}
                    </div>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">{h.changedBy} —</span>{" "}
                    <span className="italic">„{h.reason}&ldquo;</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
