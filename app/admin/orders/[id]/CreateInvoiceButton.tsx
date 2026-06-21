"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { createInvoiceFromOrder } from "@/app/admin/invoices/actions";

export function CreateInvoiceButton({
  orderId,
  hasInvoice,
}: {
  orderId: string;
  hasInvoice: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hasInvoice) {
    return null; // Invoice already exists → no button displayed anymore
  }

  const click = () => {
    setError(null);
    if (!confirm("Create invoice from this order? Status starts as draft.")) return;
    start(async () => {
      try {
        const r = await createInvoiceFromOrder({ orderId });
        router.push(`/admin/invoices/${r.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={click} size="sm" variant="outline" disabled={pending}>
        <Receipt className="h-4 w-4 mr-1" />
        {pending ? "Creating…" : "Create invoice"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
