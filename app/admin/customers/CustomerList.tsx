"use client";

import { Badge } from "@/components/ui/badge";
import { SelectableList, type ColumnDef } from "@/components/admin/SelectableList";
import type { LifecycleView } from "@/lib/lifecycle";
import type { CustomerListItemDTO } from "@/lib/dto/customer";
import {
  bulkArchiveCustomers,
  bulkDeleteCustomers,
  bulkHardDeleteCustomers,
  bulkRestoreCustomers,
} from "./actions";

const TYPE_LABEL: Record<CustomerListItemDTO["type"], string> = {
  PRIVATE: "Privat",
  BUSINESS: "Geschäft",
};

export function CustomerList({
  rows,
  view,
}: {
  rows: CustomerListItemDTO[];
  view: LifecycleView;
}) {
  const columns: ColumnDef<CustomerListItemDTO>[] = [
    {
      header: "Nr.",
      cell: (c) => (
        <span className="font-mono tabular-nums text-sm">{c.customerNumber}</span>
      ),
      className: "w-32",
    },
    {
      header: "Customer",
      cell: (c) => (
        <div>
          <div className="font-medium">{c.displayName}</div>
          {c.primaryContactName && c.primaryContactName !== c.displayName && (
            <div className="text-xs text-muted-foreground">
              {c.primaryContactName}
            </div>
          )}
        </div>
      ),
    },
    {
      header: "Typ",
      cell: (c) => (
        <Badge variant={c.type === "BUSINESS" ? "info" : "secondary"}>
          {TYPE_LABEL[c.type]}
        </Badge>
      ),
      className: "w-24",
    },
    {
      header: "Ort",
      cell: (c) => c.city ?? "—",
      className: "w-40",
    },
    {
      header: "Sprache",
      cell: (c) => <span className="text-xs uppercase">{c.language}</span>,
      className: "w-20",
    },
    {
      header: "Orders",
      cell: (c) =>
        c.openOrdersCount > 0 ? (
          <Badge variant="warning">{c.openOrdersCount} offen</Badge>
        ) : (
          <span className="text-muted-foreground text-xs tabular-nums">
            {c.totalOrdersCount} total
          </span>
        ),
      className: "w-28",
    },
    {
      header: "Status",
      cell: (c) => (
        <Badge variant={c.isActive ? "success" : "secondary"}>
          {c.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      className: "w-24",
    },
  ];

  return (
    <SelectableList
      rows={rows}
      columns={columns}
      getId={(c) => c.id}
      editHref={(c) => `/admin/customers/${c.id}`}
      view={view}
      bulk={{
        archive: (ids) => bulkArchiveCustomers(ids),
        delete: (ids) => bulkDeleteCustomers(ids),
        restore: (ids) => bulkRestoreCustomers(ids),
        hardDelete: (ids) => bulkHardDeleteCustomers(ids),
      }}
      emptyText={
        view === "active"
          ? "Keine Kunden erfasst."
          : view === "archived"
          ? "Kein Eintrag im Archiv."
          : "Papierkorb ist leer."
      }
    />
  );
}
