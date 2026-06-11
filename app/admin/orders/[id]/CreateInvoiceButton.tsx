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
    return null; // Schon eine Rechnung → kein Button mehr
  }

  const click = () => {
    setError(null);
    if (!confirm("Rechnung aus diesem Auftrag erstellen? Status startet als Entwurf.")) return;
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
        {pending ? "Erstelle …" : "Rechnung erstellen"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
