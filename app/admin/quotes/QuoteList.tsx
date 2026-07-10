"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quoteStatusLabel, type QuoteListItemDTO } from "@/lib/dto/quote";

const STATUS_VARIANT: Record<
  QuoteListItemDTO["status"],
  "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info"
> = {
  DRAFT: "outline",
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "destructive",
  EXPIRED: "secondary",
};

function fmtDate(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timezone,
  }).format(typeof d === "string" ? new Date(d) : d);
}

function fmtAmount(n: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(n);
}

interface QuoteListProps {
  rows: QuoteListItemDTO[];
  currency: string;
  locale: string;
  timezone: string;
}

export function QuoteList({ rows, currency, locale, timezone }: QuoteListProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10 text-sm">
        No offers in this view.
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
          <TableHead className="w-28">Created</TableHead>
          <TableHead className="w-28">Valid until</TableHead>
          <TableHead className="w-12 text-right">Pos.</TableHead>
          <TableHead className="w-32 text-right">Amount</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((q) => (
          <TableRow key={q.id}>
            <TableCell>
              <span className="font-mono tabular-nums text-sm">{q.quoteNumber}</span>
            </TableCell>
            <TableCell className="font-medium">{q.customerDisplayName}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <Badge variant={STATUS_VARIANT[q.status]}>
                  {quoteStatusLabel(q.status)}
                </Badge>
                {q.isExpired && (
                  <span className="text-[10px] text-destructive">expired</span>
                )}
                {q.convertedToOrderId && (
                  <span className="text-[10px] text-muted-foreground">→ order</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-xs tabular-nums">{fmtDate(q.createdAt, timezone)}</TableCell>
            <TableCell className="text-xs tabular-nums">{fmtDate(q.validUntil, timezone)}</TableCell>
            <TableCell className="text-right tabular-nums text-sm">
              {q.itemCount}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmtAmount(q.totalNetCHF, currency, locale)}</TableCell>
            <TableCell>
              <Link
                href={`/admin/quotes/${q.id}`}
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
