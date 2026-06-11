"use client";

// Banking + Rechnungs-Defaults für Schweizer QR-Rechnung.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import {
  formatIbanDisplay,
  isQrIban,
  isValidIban,
  normalizeIban,
} from "@/lib/invoice/qr-reference";
import { updateInvoiceSettings } from "@/app/admin/invoices/actions";

interface Initial {
  qrIban: string;
  invoiceCreditorName: string;
  vatNumber: string;
  invoicePaymentTerms: number;
  invoiceDefaultVatRate: number;
}

export function InvoiceSettingsForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [qrIban, setQrIban] = useState(initial.qrIban);
  const [creditorName, setCreditorName] = useState(initial.invoiceCreditorName);
  const [vatNumber, setVatNumber] = useState(initial.vatNumber);
  const [paymentTerms, setPaymentTerms] = useState(initial.invoicePaymentTerms);
  const [vatRate, setVatRate] = useState(initial.invoiceDefaultVatRate);

  const ibanNormalized = qrIban ? normalizeIban(qrIban) : "";
  const ibanValid = ibanNormalized ? isValidIban(ibanNormalized) : true;
  const isQr = ibanNormalized ? isQrIban(ibanNormalized) : false;

  const submit = () => {
    setError(null);
    setSuccess(null);
    start(async () => {
      try {
        await updateInvoiceSettings({
          qrIban: ibanNormalized,
          invoiceCreditorName: creditorName || undefined,
          vatNumber: vatNumber || undefined,
          invoicePaymentTerms: paymentTerms,
          invoiceDefaultVatRate: vatRate,
        });
        setSuccess("Banking-Einstellungen gespeichert.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1 md:col-span-2">
          <Label>
            QR-IBAN *{" "}
            <span className="text-xs text-muted-foreground font-normal">
              (Schweizer Konto, IID 30000-31999 für QR-Rechnung)
            </span>
          </Label>
          <Input
            value={qrIban}
            onChange={(e) => setQrIban(e.target.value.toUpperCase())}
            placeholder="CH44 3199 9123 0008 8901 2"
            className="font-mono"
          />
          {ibanNormalized && (
            <div className="text-xs flex items-center gap-3">
              <span className="text-muted-foreground">
                Anzeige: <span className="font-mono">{formatIbanDisplay(ibanNormalized)}</span>
              </span>
              {ibanValid ? (
                isQr ? (
                  <span className="text-emerald-700 font-medium">
                    ✓ gültige QR-IBAN
                  </span>
                ) : (
                  <span className="text-amber-700">
                    Gültige IBAN, aber keine QR-IBAN — bitte separates QR-Konto
                    bei der Bank beantragen.
                  </span>
                )
              ) : (
                <span className="text-destructive font-medium">
                  ⚠ Prüfziffer falsch
                </span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label>Konto-Inhaber (Anzeige auf QR-Rechnung)</Label>
          <Input
            value={creditorName}
            onChange={(e) => setCreditorName(e.target.value)}
            placeholder="z. B. Tschannen Spritzwerk AG"
          />
          <div className="text-xs text-muted-foreground">
            Leer lassen für Firmen-Namen aus den Stammdaten.
          </div>
        </div>

        <div className="space-y-1">
          <Label>MwSt-Nr. (UID)</Label>
          <Input
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            placeholder="CHE-123.456.789 MWST"
            className="font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label>Standard-Zahlfrist (Tage)</Label>
          <Input
            type="number"
            min={0}
            max={180}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(Number(e.target.value))}
          />
        </div>

        <div className="space-y-1">
          <Label>Standard MwSt-Satz (%)</Label>
          <Input
            type="number"
            step={0.1}
            min={0}
            max={30}
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value.replace(",", ".")))}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </div>
      )}

      <div className="flex justify-end pt-2 border-t">
        <Button onClick={submit} disabled={pending || (qrIban !== "" && !ibanValid)}>
          <Save className="h-4 w-4 mr-1" />
          {pending ? "Speichern …" : "Banking speichern"}
        </Button>
      </div>
    </div>
  );
}
