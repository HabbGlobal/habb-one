"use client";

// Status workflow buttons + optional comment prompt. Each button calls
// `changeOrderStatus` server action; the snapshot logic happens server-side
// for the DRAFT → CONFIRMED transition.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Check,
  Play,
  Pause,
  CheckCircle,
  Truck,
  XCircle,
  FileText,
} from "lucide-react";
import type { Order } from "@prisma/client";
import { changeOrderStatus } from "./actions";
import { statusLabel } from "@/lib/dto/order";

const STATUS_ICON: Partial<Record<Order["status"], React.ReactNode>> = {
  CONFIRMED: <Check className="h-4 w-4 mr-1" />,
  IN_PROGRESS: <Play className="h-4 w-4 mr-1" />,
  ON_HOLD: <Pause className="h-4 w-4 mr-1" />,
  COMPLETED: <CheckCircle className="h-4 w-4 mr-1" />,
  DELIVERED: <Truck className="h-4 w-4 mr-1" />,
  CANCELLED: <XCircle className="h-4 w-4 mr-1" />,
  INVOICED: <FileText className="h-4 w-4 mr-1" />,
};

const STATUS_VARIANT: Partial<Record<Order["status"], "default" | "destructive" | "outline">> = {
  CONFIRMED: "default",
  IN_PROGRESS: "default",
  ON_HOLD: "outline",
  COMPLETED: "default",
  DELIVERED: "default",
  INVOICED: "default",
  CANCELLED: "destructive",
};

/** Status transitions that require a comment (workflow critical). */
const REQUIRE_COMMENT: Order["status"][] = ["CANCELLED", "ON_HOLD"];

export function OrderStatusActions({
  orderId,
  currentStatus,
  allowedNext,
  canConfirm,
  canCancel,
}: {
  orderId: string;
  currentStatus: Order["status"];
  allowedNext: Order["status"][];
  canConfirm: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<Order["status"] | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const buttonAllowed = (s: Order["status"]) => {
    if (s === "CONFIRMED" && !canConfirm) return false;
    if (s === "CANCELLED" && !canCancel) return false;
    return true;
  };

  const handleClick = (s: Order["status"]) => {
    setError(null);
    setComment("");
    if (REQUIRE_COMMENT.includes(s)) {
      setTarget(s);
      return;
    }
    if (s === "CONFIRMED") {
      if (
        !confirm(
          "Confirm order? This will freeze the current calculation parameters — prices and step durations will not change after that.",
        )
      ) {
        return;
      }
    }
    submit(s, undefined);
  };

  const submit = (s: Order["status"], cmt: string | undefined) => {
    start(async () => {
      try {
        await changeOrderStatus(orderId, { toStatus: s, comment: cmt });
        setTarget(null);
        setComment("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  if (allowedNext.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">Status<strong>{statusLabel(currentStatus)}</strong> ist final — keine
        weiteren Übergänge möglich.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {allowedNext.map((s) =>
          buttonAllowed(s) ? (
            <Button
              key={s}
              variant={STATUS_VARIANT[s] ?? "outline"}
              size="sm"
              disabled={pending}
              onClick={() => handleClick(s)}
            >
              {STATUS_ICON[s]} {statusLabel(s)}
            </Button>
          ) : null,
        )}
      </div>

      {target && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <Label>
            Begründung für Übergang nach {statusLabel(target)}{" "}
            <span className="text-xs text-muted-foreground">
              (wird im Statusverlauf gespeichert)
            </span>
          </Label>
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              target === "CANCELLED"
                ? "z. B. Kunde hat zurückgezogen"
                : "z. B. Pulver fehlt, Lieferung erwartet 12.05."
            }
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTarget(null);
                setComment("");
              }}
            >Cancel</Button>
            <Button
              size="sm"
              disabled={pending || comment.trim().length < 3}
              onClick={() => submit(target, comment)}
              variant={STATUS_VARIANT[target] ?? "default"}
            >
              {STATUS_ICON[target]} {statusLabel(target)} setzen
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
