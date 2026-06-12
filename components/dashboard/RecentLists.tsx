// Zwei Listen-Karten fürs Dashboard: "Letzte Aufträge" + "Letzte Rechnungen".
// Reine Server-Components (keine Hooks). Status-Badge mit Tone-Mapping.

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateCH } from "@/lib/utils";
import type { RecentInvoice, RecentOrder } from "@/lib/dashboard/kpi";

const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Entwurf",
  CONFIRMED: "Bestätigt",
  IN_PROGRESS: "In Arbeit",
  ON_HOLD: "Pausiert",
  COMPLETED: "Fertig",
  DELIVERED: "Geliefert",
  INVOICED: "Verrechnet",
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
  DRAFT: "Entwurf",
  SENT: "Versendet",
  PAID: "Paid",
  OVERDUE: "Überfällig",
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Letzte Aufträge</CardTitle>
        <Link
          href="/admin/orders"
          className="text-xs text-habb-ink hover:text-habb-red font-medium transition-colors"
        >All ansehen →
        </Link>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">
            Noch keine Aufträge.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/orders/${r.id}`}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-habb-paper transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{r.number}</span>
                      <Badge variant={ORDER_STATUS_VARIANT[r.status] ?? "secondary"}>
                        {ORDER_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.customerName} · Eingang {formatDateCH(r.receivedAt)}
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums">
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Letzte Rechnungen</CardTitle>
        <Link
          href="/admin/invoices"
          className="text-xs text-habb-ink hover:text-habb-red font-medium transition-colors"
        >All ansehen →
        </Link>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">
            Noch keine Rechnungen.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/invoices/${r.id}`}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-habb-paper transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{r.number}</span>
                      <Badge variant={INVOICE_STATUS_VARIANT[r.status] ?? "secondary"}>
                        {INVOICE_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.customerName} · Fällig {formatDateCH(r.dueAt)}
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums">
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
