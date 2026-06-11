"use client";

// Client wrapper around <SelectableList> for the Employees page. Lives in a
// separate file because the bulk-action server actions are imported here and
// passed down to the generic list component.

import { SelectableList, type ColumnDef } from "@/components/admin/SelectableList";
import type { LifecycleView } from "@/lib/lifecycle";
import { Badge } from "@/components/ui/badge";
import {
  bulkArchiveEmployees,
  bulkDeleteEmployees,
  bulkHardDeleteEmployees,
  bulkRestoreEmployees,
} from "./actions";

export interface EmployeeRow {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentType: string;
  workloadPercent: number | null;
  annualVacationDays: number;
  isActive: boolean;
  areas: { id: string; name: string; colorHex: string }[];
}

const labels = {
  monthly: "Monatslohn",
  hourly: "Stundenlohn",
  active: "Aktiv",
  inactive: "Inaktiv",
};

export function EmployeeList({
  rows,
  view,
}: {
  rows: EmployeeRow[];
  view: LifecycleView;
}) {
  const columns: ColumnDef<EmployeeRow>[] = [
    { header: "Nr.", cell: (e) => e.employeeNumber, className: "w-16" },
    {
      header: "Name",
      cell: (e) => (
        <span>
          {e.lastName}, {e.firstName}
        </span>
      ),
    },
    {
      header: "Anstellung",
      cell: (e) =>
        e.employmentType === "MONTHLY_SALARY" ? labels.monthly : labels.hourly,
    },
    {
      header: "Pensum",
      cell: (e) => (e.workloadPercent ? `${e.workloadPercent}%` : "—"),
    },
    {
      header: "Ferien",
      cell: (e) => `${e.annualVacationDays} T`,
      className: "text-right",
    },
    {
      header: "Bereiche",
      cell: (e) =>
        e.areas.length === 0 ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {e.areas.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border"
                style={{
                  backgroundColor: a.colorHex + "1a", // 10% alpha tint
                  borderColor: a.colorHex,
                  color: a.colorHex,
                }}
              >
                {a.name}
              </span>
            ))}
          </div>
        ),
    },
    {
      header: "Status",
      cell: (e) => (
        <Badge variant={e.isActive ? "success" : "secondary"}>
          {e.isActive ? labels.active : labels.inactive}
        </Badge>
      ),
    },
  ];

  return (
    <SelectableList
      rows={rows}
      columns={columns}
      getId={(e) => e.id}
      editHref={(e) => `/admin/employees/${e.id}`}
      view={view}
      bulk={{
        archive: (ids) => bulkArchiveEmployees(ids),
        delete: (ids) => bulkDeleteEmployees(ids),
        restore: (ids) => bulkRestoreEmployees(ids),
        hardDelete: (ids) => bulkHardDeleteEmployees(ids),
      }}
      emptyText={
        view === "active"
          ? "Keine aktiven Mitarbeitenden."
          : view === "archived"
          ? "Keine archivierten Mitarbeitenden."
          : "Papierkorb ist leer."
      }
    />
  );
}
