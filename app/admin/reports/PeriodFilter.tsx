"use client";

// Period-Filter für ERP-Reports. Sync mit URL-Search-Params, damit
// Server-Komponenten die Daten frisch laden.

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "lucide-react";

type Preset =
  | { label: string; days: number }
  | { label: string; current: "month" | "quarter" | "year" };

const PRESETS: Preset[] = [
  { label: "Letzte 7 Tage", days: 7 },
  { label: "Letzte 30 Tage", days: 30 },
  { label: "Aktueller Monat", current: "month" },
  { label: "Aktuelles Quartal", current: "quarter" },
  { label: "Aktuelles Jahr", current: "year" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function PeriodFilter({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const from = sp.get("from") ?? defaultFrom;
  const to = sp.get("to") ?? defaultTo;

  const setRange = (newFrom: string, newTo: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set("from", newFrom);
    next.set("to", newTo);
    router.push(`?${next.toString()}`);
  };

  const applyPreset = (preset: Preset) => {
    const today = new Date();
    if ("days" in preset) {
      const f = new Date(today);
      f.setDate(today.getDate() - preset.days + 1);
      setRange(isoDate(f), isoDate(today));
    } else {
      let f: Date;
      if (preset.current === "month") f = startOfMonth(today);
      else if (preset.current === "quarter") f = startOfQuarter(today);
      else f = startOfYear(today);
      setRange(isoDate(f), isoDate(today));
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 bg-muted/30 rounded-lg p-3 border">
      <div className="space-y-1">
        <Label className="text-xs">Von</Label>
        <Input
          type="date"
          value={from}
          onChange={(e) => setRange(e.target.value, to)}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Bis</Label>
        <Input
          type="date"
          value={to}
          onChange={(e) => setRange(from, e.target.value)}
          className="w-40"
        />
      </div>
      <div className="flex flex-wrap gap-1 ml-auto">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset(p)}
          >
            <Calendar className="h-3 w-3 mr-1" />
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
