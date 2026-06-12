"use client";

import { Badge } from "@/components/ui/badge";
import { SelectableList, type ColumnDef } from "@/components/admin/SelectableList";
import { localDateString } from "@/lib/time/zone";
import type { LifecycleView } from "@/lib/lifecycle";
import {
  bulkArchiveAbsences,
  bulkDeleteAbsences,
  bulkHardDeleteAbsences,
  bulkRestoreAbsences,
} from "./actions";

export interface AbsenceRow {
  id: string;
  employeeName: string;
  typeLabel: string;
  typeColor: string;
  startDate: Date;
  endDate: Date;
  startHalfDay: boolean;
  endHalfDay: boolean;
  status: string;
}

export function AbsenceList({ rows, view }: { rows: AbsenceRow[]; view: LifecycleView }) {
  const columns: ColumnDef<AbsenceRow>[] = [
    { header: "Name", cell: (a) => a.employeeName },
    {
      header: "Type",
      cell: (a) => (
        <span className="inline-flex items-center gap-2">
          <span style={{ color: a.typeColor }}>●</span> {a.typeLabel}
        </span>
      ),
    },
    {
      header: "Von",
      cell: (a) =>
        `${localDateString(a.startDate)}${a.startHalfDay ? " (½)" : ""}`,
    },
    {
      header: "Bis",
      cell: (a) =>
        `${localDateString(a.endDate)}${a.endHalfDay ? " (½)" : ""}`,
    },
    {
      header: "Status",
      cell: (a) => (
        <Badge
          variant={
            a.status === "APPROVED"
              ? "success"
              : a.status === "REJECTED" || a.status === "CANCELLED"
              ? "secondary"
              : "warning"
          }
        >
          {a.status}
        </Badge>
      ),
    },
  ];

  return (
    <SelectableList
      rows={rows}
      columns={columns}
      getId={(a) => a.id}
      editHref={(a) => `/admin/absences/${a.id}`}
      view={view}
      bulk={{
        archive: (ids) => bulkArchiveAbsences(ids),
        delete: (ids) => bulkDeleteAbsences(ids),
        restore: (ids) => bulkRestoreAbsences(ids),
        hardDelete: (ids) => bulkHardDeleteAbsences(ids),
      }}
      emptyText={
        view === "active"
          ? "Keine Absenzen."
          : view === "archived"
          ? "Kein Eintrag im Archiv."
          : "Papierkorb ist leer."
      }
    />
  );
}
