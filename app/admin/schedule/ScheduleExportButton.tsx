"use client";

// Schedule export dialog. Two range modes (Month / Week), optional area
// filter, two formats (PDF / Excel). Buttons trigger downloads via the
// /api/reports/schedule endpoint.

import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface AreaOption {
  id: string;
  name: string;
}

export function ScheduleExportButton({
  year,
  month,
  areas,
}: {
  year: number;
  month: number;
  areas: AreaOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"month" | "week">("month");
  const [weekStart, setWeekStart] = useState(() => firstMondayOf(year, month));
  const [areaId, setAreaId] = useState<string>("");

  const buildUrl = (format: "pdf" | "xlsx") => {
    const params = new URLSearchParams({ format });
    if (mode === "month") {
      params.set("year", String(year));
      params.set("month", String(month));
    } else {
      params.set("weekStart", weekStart);
    }
    if (areaId) params.set("areaId", areaId);
    return `/api/reports/schedule?${params.toString()}`;
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Download className="mr-2 h-4 w-4" />
        Export
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <Card className="fixed inset-x-4 top-12 z-50 mx-auto max-w-md max-h-[80vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">Export plan</CardTitle>
                <p className="text-sm text-muted-foreground">
                  PDF (print-ready) or Excel (for further processing)
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
              <div>
                <Label>Period</Label>
                <div className="mt-1 flex gap-1">
                  <button
                    type="button"
                    className={`flex-1 h-9 rounded text-sm font-medium border ${
                      mode === "month"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent"
                    }`}
                    onClick={() => setMode("month")}
                  >
                    Month ({String(month).padStart(2, "0")}/{year})
                  </button>
                  <button
                    type="button"
                    className={`flex-1 h-9 rounded text-sm font-medium border ${
                      mode === "week"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent"
                    }`}
                    onClick={() => setMode("week")}
                  >Week</button>
                </div>
              </div>

              {mode === "week" && (
                <div className="space-y-1">
                  <Label>Date in the week</Label>
                  <Input
                    type="date"
                    value={weekStart}
                    onChange={(e) => setWeekStart(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The entire week (Mon–Sun) containing this date will be exported.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <Label>Area (optional)</Label>
                <Select
                  value={areaId}
                  onChange={(e) => setAreaId(e.target.value)}
                >
                  <option value="">All areas</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Filters employee rows to those of the selected area.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button asChild>
                  <a href={buildUrl("pdf")} onClick={() => setOpen(false)}>
                    PDF download
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={buildUrl("xlsx")} onClick={() => setOpen(false)}>
                    Excel download
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

/** Returns the YYYY-MM-DD string for the first Monday on or after the 1st of month. */
function firstMondayOf(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  // (getUTCDay()+6)%7 → Mon=0
  while ((d.getUTCDay() + 6) % 7 !== 0) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}
