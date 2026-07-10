import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateCH } from "@/lib/utils";
import type { RecentInvoice, RecentOrder } from "@/lib/dashboard/kpi";
import { ArrowUpRight } from "lucide-react";
import { formatCurrencyLarge } from "@/lib/format-currency";

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

type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "info"
  | "destructive";

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

function fmtAmount(n: number | null | undefined, currency: string, locale?: string): string {
  return formatCurrencyLarge(n ?? 0, currency, locale);
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 py-8 text-center text-sm text-habb-muted">
      {label}
    </div>
  );
}

export function RecentOrdersCard({ rows, currency, locale }: { rows: RecentOrder[]; currency: string; locale?: string }) {
  return (
    <section className="rounded-xl border border-habb-line bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-habb-ink dark:text-white">
          Recent orders
        </h3>

        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1 text-xs font-semibold text-habb-red hover:text-habb-red-dark"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="No orders yet." />
      ) : (
        <ul className="-mx-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/orders/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-habb-paper dark:hover:bg-neutral-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-habb-ink dark:text-white">
                      {r.number}
                    </span>

                    <Badge variant={ORDER_STATUS_VARIANT[r.status] ?? "secondary"}>
                      {ORDER_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </div>

                  <p className="mt-1 truncate text-xs text-habb-muted">
                    {r.customerName} · Received {formatDateCH(r.receivedAt)}
                  </p>
                </div>

                <div className="text-right text-sm font-semibold tabular-nums text-habb-ink dark:text-white">
                  {r.totalNetCHF != null ? fmtAmount(r.totalNetCHF, currency, locale) : "—"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecentInvoicesCard({ rows, currency, locale }: { rows: RecentInvoice[]; currency: string; locale?: string }) {
  return (
    <section className="rounded-xl border border-habb-line bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-habb-ink dark:text-white">
          Recent invoices
        </h3>

        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1 text-xs font-semibold text-habb-red hover:text-habb-red-dark"
        >
          View all <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState label="No invoices yet." />
      ) : (
        <ul className="-mx-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/invoices/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-habb-paper dark:hover:bg-neutral-900"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-habb-ink dark:text-white">
                      {r.number}
                    </span>

                    <Badge
                      variant={INVOICE_STATUS_VARIANT[r.status] ?? "secondary"}
                    >
                      {INVOICE_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </div>

                  <p className="mt-1 truncate text-xs text-habb-muted">
                    {r.customerName} · Due {formatDateCH(r.dueAt)}
                  </p>
                </div>

                <div className="text-right text-sm font-semibold tabular-nums text-habb-ink dark:text-white">
                  {fmtAmount(r.totalGrossCHF, currency, locale)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}