"use client";

import Link from "next/link";
import { Pencil, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { invoiceStatusLabel, type InvoiceListItemDTO } from "@/lib/dto/invoice";

const STATUS_VARIANT: Record<
  InvoiceListItemDTO["status"],
  "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info"
> = {
  DRAFT: "outline",
  SENT: "info",
  PAID: "success",
  OVERDUE: "destructive",
  CANCELLED: "secondary",
};

function fmtDate(d: Date, timezone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale ?? "de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timezone,
  }).format(typeof d === "string" ? new Date(d) : d);
}

function fmtAmount(n: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale ?? "de-CH", {
    style: "currency",
    currency,
  }).format(n);
}

interface InvoiceListProps {
  rows: InvoiceListItemDTO[];
  currency: string;
  locale: string;
  timezone: string;
}

export function InvoiceList({ rows, currency, locale, timezone }: InvoiceListProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10 text-sm">
        No invoices in this view.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Nr.</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead className="w-24">Date</TableHead>
          <TableHead className="w-24">Due</TableHead>
          <TableHead className="w-16">Rem.</TableHead>
          <TableHead className="w-32 text-right">Amount (Gross)</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((i) => (
          <TableRow key={i.id}>
            <TableCell>
              <span className="font-mono tabular-nums text-sm">{i.invoiceNumber}</span>
            </TableCell>
            <TableCell className="font-medium">{i.customerDisplayName}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <Badge variant={STATUS_VARIANT[i.status]}>
                  {invoiceStatusLabel(i.status)}
                </Badge>
                {i.isOverdue && i.status !== "OVERDUE" && (
                  <span className="text-[10px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />overdue</span>
                )}
                {i.orderId && (
                  <span className="text-[10px] text-muted-foreground">from order</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-xs tabular-nums">{fmtDate(i.issuedAt, timezone, locale)}</TableCell>
            <TableCell className="text-xs tabular-nums">{fmtDate(i.dueAt, timezone, locale)}</TableCell>
            <TableCell className="text-center">
              {i.reminderLevel > 0 ? (
                <Badge variant="warning" className="text-[10px]">
                  {i.reminderLevel}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtAmount(i.totalGrossCHF, currency, locale)}</TableCell>
            <TableCell>
              <Link
                href={`/admin/invoices/${i.id}`}
                className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-accent transition"
                aria-label="Edit"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
