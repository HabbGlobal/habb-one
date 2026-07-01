"use client";

// Status buttons + convert-to-order dialog for the quote detail page.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRightLeft,
  RotateCw,
} from "lucide-react";
import type { Quote } from "@prisma/client";
import { changeQuoteStatus, convertQuoteToOrder } from "../actions";
import { quoteStatusLabel } from "@/lib/dto/quote";

const ICON: Partial<Record<Quote["status"], React.ReactNode>> = {
  SENT:     <Send className="h-4 w-4 mr-1" />,
  ACCEPTED: <CheckCircle2 className="h-4 w-4 mr-1" />,
  REJECTED: <XCircle className="h-4 w-4 mr-1" />,
  EXPIRED:  <Clock className="h-4 w-4 mr-1" />,
};

const VARIANT: Partial<Record<Quote["status"], "default" | "destructive" | "outline">> = {
  SENT:     "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED:  "outline",
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function QuoteActions({
  quoteId,
  currentStatus,
  allowedNext,
  isConverted,
  canSend,
  canConvert,
}: {
  quoteId: string;
  currentStatus: Quote["status"];
  allowedNext: Quote["status"][];
  isConverted: boolean;
  canSend: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [promisedAt, setPromisedAt] = useState(todayPlus(21));
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "EXPRESS">("NORMAL");

  const onClick = (s: Quote["status"]) => {
    setError(null);
    if (s === "SENT" && !canSend) {
      setError("No permission to send.");
      return;
    }
    const confirmMsg =
      s === "SENT"
        ? "Send quote? This will freeze the current calculation parameters — the price remains fixed until the validity date."
        : s === "ACCEPTED"
        ? "Offerte als angenommen markieren? Du kannst sie danach in einen Auftrag umwandeln."
        : s === "REJECTED"
        ? "Offerte als abgelehnt markieren?"
        : null;
    if (confirmMsg && !confirm(confirmMsg)) return;

    start(async () => {
      try {
        await changeQuoteStatus(quoteId, { toStatus: s });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  const onConvert = () => {
    setError(null);
    if (!promisedAt) {
      setError("Liefertermin angeben.");
      return;
    }
    start(async () => {
      try {
        const r = await convertQuoteToOrder(quoteId, {
          promisedAt: new Date(promisedAt),
          priority,
        });
        router.push(`/admin/orders/${r.orderId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  const showConvertButton = currentStatus === "ACCEPTED" && !isConverted && canConvert;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {allowedNext.map((s) => (
          <Button
            key={s}
            variant={VARIANT[s] ?? "outline"}
            size="sm"
            disabled={pending}
            onClick={() => onClick(s)}
          >
            {ICON[s] ?? <RotateCw className="h-4 w-4 mr-1" />}
            {quoteStatusLabel(s)}
          </Button>
        ))}
        {showConvertButton && (
          <Button
            size="sm"
            onClick={() => setShowConvert((s) => !s)}
            disabled={pending}
          >
            <ArrowRightLeft className="h-4 w-4 mr-1" />
            Convert to Order
          </Button>
        )}
      </div>

      {isConverted && (
        <p className="text-sm text-muted-foreground italic">
          This quotation has already been converted into an order.
        </p>
      )}

      {showConvert && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="text-sm font-medium">Convert Quotation to Order</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Delivery Date *</Label>
              <Input
                type="date"
                value={promisedAt}
                onChange={(e) => setPromisedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "LOW" | "NORMAL" | "HIGH" | "EXPRESS")
                }
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="EXPRESS">Express</option>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The order will be created directly in <strong>Confirmed</strong> status and adopts
            the snapshot of the quote. The ProcessSteps are generated based on the templates per position.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowConvert(false)}
              disabled={pending}
            >Cancel</Button>
            <Button onClick={onConvert} size="sm" disabled={pending}>
              {pending ? "Converting…" : "Create order"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
