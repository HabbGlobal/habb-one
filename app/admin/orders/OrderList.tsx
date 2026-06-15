"use client";

import { Badge } from "@/components/ui/badge";
import { SelectableList, type ColumnDef } from "@/components/admin/SelectableList";
import type { LifecycleView } from "@/lib/lifecycle";
import {
  type OrderListItemDTO,
  priorityLabel,
  statusLabel,
} from "@/lib/dto/order";
import {
  bulkArchiveOrders,
  bulkDeleteOrders,
  bulkHardDeleteOrders,
  bulkRestoreOrders,
} from "./actions";

const STATUS_VARIANT: Record<
  OrderListItemDTO["status"],
  "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info"
> = {
  DRAFT: "outline",
  CONFIRMED: "info",
  IN_PROGRESS: "warning",
  ON_HOLD: "secondary",
  COMPLETED: "success",
  DELIVERED: "success",
  CANCELLED: "destructive",
  INVOICED: "default",
};

const PRIORITY_VARIANT: Record<
  OrderListItemDTO["priority"],
  "default" | "secondary" | "outline" | "warning" | "destructive"
> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "warning",
  EXPRESS: "destructive",
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function formatCHF(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}

function formatHours(min: number): string {
  const h = min / 60;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

export function OrderList({
  rows,
  view,
}: {
  rows: OrderListItemDTO[];
  view: LifecycleView;
}) {
  const columns: ColumnDef<OrderListItemDTO>[] = [
    {
      header: "Nr.",
      cell: (o) => (
        <span className="font-mono tabular-nums text-sm">{o.orderNumber}</span>
      ),
      className: "w-32",
    },
    {
      header: "Customer",
      cell: (o) => <div className="font-medium">{o.customerDisplayName}</div>,
    },
    {
      header: "Received",
      cell: (o) => (
        <span className="text-xs tabular-nums">{formatDate(o.receivedAt)}</span>
      ),
      className: "w-24",
    },
    {
      header: "Delivery date",
      cell: (o) => (
        <span
          className={
            o.isLate
              ? "font-medium text-destructive tabular-nums"
              : "tabular-nums text-sm"
          }
        >
          {formatDate(o.promisedAt)}
          {o.isLate && (
            <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-destructive" />
          )}
        </span>
      ),
      className: "w-32",
    },
    {
      header: "Status",
      cell: (o) => (
        <Badge variant={STATUS_VARIANT[o.status]}>{statusLabel(o.status)}</Badge>
      ),
      className: "w-32",
    },
    {
      header: "Prio",
      cell: (o) =>
        o.priority === "NORMAL" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Badge variant={PRIORITY_VARIANT[o.priority]}>
            {priorityLabel(o.priority)}
          </Badge>
        ),
      className: "w-20",
    },
    {
      header: "Pos.",
      cell: (o) => (
        <span className="tabular-nums text-sm">{o.itemCount}</span>
      ),
      className: "w-12",
    },
    {
      header: "Estimate",
      cell: (o) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {formatHours(o.totalEstimatedMinutes)}
        </span>
      ),
      className: "w-20",
    },
    {
      header: "Ist",
      cell: (o) =>
        o.totalActualMinutes != null ? (
          <span className="tabular-nums text-sm">
            {formatHours(o.totalActualMinutes)}
          </span>
        ) : o.totalActualMinutes === null && o.status !== "DRAFT" && o.status !== "CONFIRMED" ? (
          <span className="text-xs text-muted-foreground italic">partial</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      className: "w-20",
    },
    {
      header: "Billed",
      cell: (o) => (
        <span className="tabular-nums text-sm font-medium text-emerald-700">
          {formatHours(o.totalBilledMinutes)}
        </span>
      ),
      className: "w-24",
    },
    {
      header: "Amount",
      cell: (o) =>
        o.totalNetCHF != null ? (
          <span className="tabular-nums text-sm">{formatCHF(o.totalNetCHF)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      className: "w-28",
    },
  ];

  return (
    <SelectableList
      rows={rows}
      columns={columns}
      getId={(o) => o.id}
      editHref={(o) => `/admin/orders/${o.id}`}
      view={view}
      bulk={{
        archive: (ids) => bulkArchiveOrders(ids),
        delete: (ids) => bulkDeleteOrders(ids),
        restore: (ids) => bulkRestoreOrders(ids),
        hardDelete: (ids) => bulkHardDeleteOrders(ids),
      }}
      emptyText={
        view === "active"
          ? "No orders recorded."
          : view === "archived"
          ? "No entries in archive."
          : "Trash is empty."
      }
    />
  );
}
