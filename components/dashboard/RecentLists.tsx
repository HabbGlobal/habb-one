// Recent activity cards for dashboard: "Recent Orders" + "Recent Invoices".
// Pure server components (no hooks). Status badge with tone mapping.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateCH } from "@/lib/utils";
import type { RecentInvoice, RecentOrder } from "@/lib/dashboard/kpi";
import { ArrowUpRight } from "lucide-react";

const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  DELIVERED: "Delivered",
  INVOICED: "Invoiced",
  CANCELLED: "Cancelled",
};

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "info" | "destructive";

const ORDER_STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: "secondary",
  CONFIRMED: "info",
  IN_PROGRESS: "warning",
  ON_HOLD: "warning",
  COMPLETED: "success",
  DELIVERED: "success",
  INVOICED: "success",
  CANCELLED: "destructive",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

const INVOICE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  DRAFT: "secondary",
  SENT: "info",
  PAID: "success",
  OVERDUE: "destructive",
  CANCELLED: "secondary",
};

const CHF = (n: number) =>
  new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

export function RecentOrdersCard({ rows }: { rows: RecentOrder[] }) {
  return (
    <Card className="overflow-hidden border-0 shadow-sm bg-white/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
        <CardTitle className="text-sm font-semibold">Recent Orders</CardTitle>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 py-8 text-center">
            No orders yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/orders/${r.id}`}
                  className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{r.number}</span>
                      <Badge variant={ORDER_STATUS_VARIANT[r.status] ?? "secondary"}>
                        {ORDER_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.customerName} · Received {formatDateCH(r.receivedAt)}
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium tabular-nums">
                    {r.totalNetCHF != null ? CHF(r.totalNetCHF) : "—"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentInvoicesCard({ rows }: { rows: RecentInvoice[] }) {
  return (
    <Card className="overflow-hidden border-0 shadow-sm bg-white/80 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-slate-100">
        <CardTitle className="text-sm font-semibold">Recent Invoices</CardTitle>
        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 py-8 text-center">
            No invoices yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/invoices/${r.id}`}
                  className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{r.number}</span>
                      <Badge variant={INVOICE_STATUS_VARIANT[r.status] ?? "secondary"}>
                        {INVOICE_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.customerName} · Due {formatDateCH(r.dueAt)}
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium tabular-nums">
                    {CHF(r.totalGrossCHF)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
