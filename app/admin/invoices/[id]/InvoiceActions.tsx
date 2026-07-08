"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Send,
  CheckCircle2,
  XCircle,
  Bell,
  RotateCw,
  AlertTriangle,
} from "lucide-react";
import type { Invoice } from "@prisma/client";
import {
  changeInvoiceStatus,
  markInvoicePaid,
  sendInvoiceReminder,
} from "../actions";
import { invoiceStatusLabel } from "@/lib/dto/invoice";

const ICON: Partial<Record<Invoice["status"], React.ReactNode>> = {
  SENT: <Send className="h-4 w-4 mr-1" />,
  PAID: <CheckCircle2 className="h-4 w-4 mr-1" />,
  CANCELLED: <XCircle className="h-4 w-4 mr-1" />,
  OVERDUE: <AlertTriangle className="h-4 w-4 mr-1" />,
};

const VARIANT: Partial<
  Record<Invoice["status"], "default" | "destructive" | "outline">
> = {
  SENT: "default",
  PAID: "default",
  CANCELLED: "destructive",
  OVERDUE: "outline",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InvoiceActions({
  invoiceId,
  currentStatus,
  allowedNext,
  totalGrossCHF,
  reminderLevel,
  canMarkPaid,
}: {
  invoiceId: string;
  currentStatus: Invoice["status"];
  allowedNext: Invoice["status"][];
  totalGrossCHF: number;
  reminderLevel: number;
  canMarkPaid: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [paidAt, setPaidAt] = useState(todayIso());
  const [paidAmount, setPaidAmount] = useState<number>(totalGrossCHF);

  const handle = (s: Invoice["status"]) => {
    setError(null);
    if (s === "PAID") {
      setShowPaid(true);
      return;
    }
    const confirmMsg =
      s === "SENT"
        ? "Send invoice? This will assign the QR reference — the invoice is then immutable."
        : s === "CANCELLED"
        ? "Really cancel invoice?"
        : null;
    if (confirmMsg && !confirm(confirmMsg)) return;

    start(async () => {
      try {
        await changeInvoiceStatus(invoiceId, { toStatus: s });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const onMarkPaid = () => {
    setError(null);
    start(async () => {
      try {
        await markInvoicePaid(invoiceId, {
          paidAt: new Date(paidAt),
          paidAmountCHF: paidAmount,
        });
        setShowPaid(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const onReminder = () => {
    if (
      !confirm(
        `Record reminder level ${Math.min(3, reminderLevel + 1)}? (The sending of the PDF reminder is done manually.)`,
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await sendInvoiceReminder(invoiceId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const canSendReminder = ["SENT", "OVERDUE"].includes(currentStatus) && reminderLevel < 3;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {allowedNext.map((s) =>
          s === "PAID" && !canMarkPaid ? null : (
            <Button
              key={s}
              variant={VARIANT[s] ?? "outline"}
              size="sm"
              disabled={pending}
              onClick={() => handle(s)}
            >
              {ICON[s] ?? <RotateCw className="h-4 w-4 mr-1" />}
              {invoiceStatusLabel(s)}
            </Button>
          ),
        )}
        {canSendReminder && (
          <Button variant="outline" size="sm" disabled={pending} onClick={onReminder}>
            <Bell className="h-4 w-4 mr-1" />
            Reminder level {Math.min(3, reminderLevel + 1)}
          </Button>
        )}
      </div>

      {showPaid && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="text-sm font-medium">Mark as paid</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Payment date *</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (CHF)</Label>
              <Input
                type="number"
                step={0.01}
                min={0}
                value={paidAmount}
                onChange={(e) =>
                  setPaidAmount(Number(e.target.value.replace(",", ".")))
                }
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPaid(false)}
              disabled={pending}
            >Cancel</Button>
            <Button onClick={onMarkPaid} size="sm" disabled={pending}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark as paid
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
