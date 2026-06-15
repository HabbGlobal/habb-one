"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { autoPlanMonth } from "./actions";

interface UnfilledSlot {
  areaId: string;
  areaName: string;
  date: string;
  reason: string;
}

export function AutoPlanButton({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [defaultStart, setDefaultStart] = useState("07:30");
  const [defaultEnd, setDefaultEnd] = useState("16:30");
  const [breakMin, setBreakMin] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ written: number; unfilled: UnfilledSlot[] } | null>(null);

  const run = () => {
    setError(null);
    setReport(null);
    start(async () => {
      try {
        const res = await autoPlanMonth({
          year,
          month,
          overwriteExisting,
          defaultStart,
          defaultEnd,
          defaultBreakMinutes: breakMin,
        });
        setReport(res);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setReport(null);
          setError(null);
          setOpen(true);
        }}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Auto-plan
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-md max-h-[85vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">Auto-plan month</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Distributes available, qualified employees across areas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-accent"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {!report ? (
                <>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      ✓ Mon–Fri are planned, weekends and holidays skipped
                    </p>
                    <p>
                      ✓ Employees on vacation / sickness / absence are excluded
                    </p>
                    <p>
                      ✓ Limited areas (Sandblasting, Powder Coating) are filled first
                    </p>
                    <p>
                      ✓ Even distribution across qualified employees
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Default start">
                      <Input
                        type="time"
                        value={defaultStart}
                        onChange={(e) => setDefaultStart(e.target.value)}
                      />
                    </Field>
                    <Field label="Default end">
                      <Input
                        type="time"
                        value={defaultEnd}
                        onChange={(e) => setDefaultEnd(e.target.value)}
                      />
                    </Field>
                    <Field label="Break (min)">
                      <Input
                        type="number"
                        min={0}
                        max={180}
                        step={5}
                        value={breakMin}
                        onChange={(e) => setBreakMin(Number(e.target.value || 0))}
                      />
                    </Field>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={overwriteExisting}
                      onChange={(e) => setOverwriteExisting(e.target.checked)}
                    />
                    Overwrite existing area assignments
                  </label>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="button" onClick={run} disabled={pending}>
                      Plan now
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                    ✓ <strong>{report.written}</strong> day assignments made.
                  </div>
                  {report.unfilled.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {report.unfilled.length} unfilled slots
                      </p>
                      <ul className="text-xs text-muted-foreground max-h-40 overflow-y-auto space-y-0.5">
                        {report.unfilled.slice(0, 30).map((u, i) => (
                          <li key={i}>
                            <strong>{u.areaName}</strong> · {u.date} — {u.reason}
                          </li>
                        ))}
                        {report.unfilled.length > 30 && (
                          <li>… +{report.unfilled.length - 30} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end pt-2">
                    <Button type="button" onClick={() => setOpen(false)}>
                      Close
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
