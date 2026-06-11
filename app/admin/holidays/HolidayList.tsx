"use client";

import { SelectableList, type ColumnDef } from "@/components/admin/SelectableList";
import { localDateString } from "@/lib/time/zone";
import type { LifecycleView } from "@/lib/lifecycle";
import {
  bulkArchiveHolidays,
  bulkDeleteHolidays,
  bulkHardDeleteHolidays,
  bulkRestoreHolidays,
} from "./actions";

export interface HolidayRow {
  id: string;
  date: Date;
  nameDe: string;
  nameEn: string;
  fraction: number;
}

export function HolidayList({ rows, view }: { rows: HolidayRow[]; view: LifecycleView }) {
  const columns: ColumnDef<HolidayRow>[] = [
    { header: "Datum", cell: (h) => localDateString(h.date) },
    { header: "DE", cell: (h) => h.nameDe },
    { header: "EN", cell: (h) => h.nameEn },
    { header: "Anteil", cell: (h) => h.fraction.toString() },
  ];
  return (
    <SelectableList
      rows={rows}
      columns={columns}
      getId={(h) => h.id}
      editHref={(h) => `/admin/holidays/${h.id}`}
      view={view}
      bulk={{
        archive: (ids) => bulkArchiveHolidays(ids),
        delete: (ids) => bulkDeleteHolidays(ids),
        restore: (ids) => bulkRestoreHolidays(ids),
        hardDelete: (ids) => bulkHardDeleteHolidays(ids),
      }}
      emptyText={
        view === "active"
          ? "Keine Feiertage erfasst."
          : view === "archived"
          ? "Kein Eintrag im Archiv."
          : "Papierkorb ist leer."
      }
    />
  );
}
