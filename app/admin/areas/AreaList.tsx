"use client";

import { SelectableList, type ColumnDef } from "@/components/admin/SelectableList";
import type { LifecycleView } from "@/lib/lifecycle";
import {
  bulkArchiveAreas,
  bulkDeleteAreas,
  bulkHardDeleteAreas,
  bulkRestoreAreas,
} from "./actions";

export interface AreaRow {
  id: string;
  name: string;
  description: string | null;
  colorHex: string;
  sortOrder: number;
  memberCount: number;
  minEmployeesPerDay: number | null;
  maxEmployeesPerDay: number | null;
}

export function AreaList({ rows, view }: { rows: AreaRow[]; view: LifecycleView }) {
  const columns: ColumnDef<AreaRow>[] = [
    {
      header: "Area",
      cell: (a) => (
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full border"
            style={{ backgroundColor: a.colorHex }}
          />
          <span className="font-medium">{a.name}</span>
        </div>
      ),
    },
    {
      header: "Beschreibung",
      cell: (a) => (
        <span className="text-muted-foreground text-sm">{a.description ?? "—"}</span>
      ),
    },
    {
      header: "Mitarbeitende",
      cell: (a) => <span className="tabular-nums">{a.memberCount}</span>,
      className: "text-right",
    },
    {
      header: "Min/Tag",
      cell: (a) => (
        <span className="tabular-nums text-muted-foreground">
          {a.minEmployeesPerDay ?? "—"}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Max/Tag",
      cell: (a) => (
        <span className="tabular-nums text-muted-foreground">
          {a.maxEmployeesPerDay ?? "∞"}
        </span>
      ),
      className: "text-right",
    },
    {
      header: "Sort Order",
      cell: (a) => <span className="tabular-nums text-muted-foreground">{a.sortOrder}</span>,
      className: "text-right w-24",
    },
  ];

  return (
    <SelectableList
      rows={rows}
      columns={columns}
      getId={(a) => a.id}
      editHref={(a) => `/admin/areas/${a.id}`}
      view={view}
      bulk={{
        archive: (ids) => bulkArchiveAreas(ids),
        delete: (ids) => bulkDeleteAreas(ids),
        restore: (ids) => bulkRestoreAreas(ids),
        hardDelete: (ids) => bulkHardDeleteAreas(ids),
      }}
      emptyText={
        view === "active"
          ? "No areas recorded."
          : view === "archived"
          ? "No entries in archive."
          : "Trash is empty."
      }
    />
  );
}
