"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ParameterRow } from "./ParameterRow";
import {
  ParameterHistoryDialog,
  type HistoryEntry,
} from "./ParameterHistoryDialog";
import type { ParameterDialogData } from "./ParameterEditDialog";

export interface ParameterRowData extends ParameterDialogData {
  category: string;
  subCategory: string | null;
  lastChangedAt: Date;
  lastChangedBy: string | null;
  historyCount: number;
  history: HistoryEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  PROCESS_TIME: "Process times",
  CURING: "Curing",
  DRYING: "Drying",
  MATERIAL: "Material multipliers",
  COMPLEXITY: "Complexity factors",
  PRICING_RATE: "Hourly rates",
  PRICING_SURCHARGE: "Surcharges & flat fees",
  SCHEDULER: "Scheduler parameters",
  TAX: "VAT rates",
  WORKING_HOURS: "Working hours",
  OTHER: "Other",
};

const ORDER = [
  "PROCESS_TIME",
  "CURING",
  "DRYING",
  "MATERIAL",
  "COMPLEXITY",
  "PRICING_RATE",
  "PRICING_SURCHARGE",
  "SCHEDULER",
  "TAX",
  "WORKING_HOURS",
  "OTHER",
];

export function ParameterTable({
  rows,
  canWrite,
  currency,
  locale,
}: {
  rows: ParameterRowData[];
  canWrite: boolean;
  currency: string;
  locale: string;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [history, setHistory] = useState<{
    paramKey: string;
    paramLabel: string;
    unit: string | null;
    entries: HistoryEntry[];
  } | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeCategory !== "ALL" && r.category !== activeCategory) return false;
      if (!q) return true;
      return (
        r.label.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, activeCategory]);

  // Group by sub-category for the active category — gives a clean structure
  // when looking at e.g. all CURING profiles (polyester-standard, lowtemp …).
  const grouped = useMemo(() => {
    const map = new Map<string, ParameterRowData[]>();
    for (const r of filtered) {
      const k = r.subCategory ?? "—";
      const list = map.get(k) ?? [];
      list.push(r);
      map.set(k, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by label, key, or description …"
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} / {rows.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b">
        <CategoryTab
          label="All"
          count={rows.length}
          active={activeCategory === "ALL"}
          onClick={() => setActiveCategory("ALL")}
        />
        {ORDER.filter((k) => counts.has(k)).map((k) => (
          <CategoryTab
            key={k}
            label={CATEGORY_LABELS[k] ?? k}
            count={counts.get(k) ?? 0}
            active={activeCategory === k}
            onClick={() => setActiveCategory(k)}
          />
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">
              No parameters found
            </p>
          ) : (
            <div>
              {grouped.map(([sub, items]) => (
                <div key={sub}>
                  {sub !== "—" && (
                    <div className="bg-muted/50 px-3 py-1.5 text-xs uppercase font-semibold text-muted-foreground border-b">
                      {sub}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead className="sr-only">
                      <tr>
                        <th>Parameter</th>
                        <th>Current</th>
                        <th>Default</th>
                        <th>Last Change</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((r) => (
                        <ParameterRow
                          key={r.key}
                          param={r}
                          canWrite={canWrite}
                          currency={currency}
                          locale={locale}
                          onShowHistory={() =>
                            setHistory({
                              paramKey: r.key,
                              paramLabel: r.label,
                              unit: r.unit,
                              entries: r.history,
                            })
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {history && (
        <ParameterHistoryDialog
          paramKey={history.paramKey}
          paramLabel={history.paramLabel}
          unit={history.unit}
          history={history.entries}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}

function CategoryTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
      }`}
    >
      {label}{" "}
      <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">
        ({count})
      </span>
    </button>
  );
}
