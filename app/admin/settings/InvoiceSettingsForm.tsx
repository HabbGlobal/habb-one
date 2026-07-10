"use client";

// Banking + invoice defaults for Swiss QR invoice.

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

export function InvoiceSettingsForm({ initial, country }: { initial: Initial; country: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [qrIban, setQrIban] = useState(initial.qrIban);
  const [creditorName, setCreditorName] = useState(initial.invoiceCreditorName);
  const [vatNumber, setVatNumber] = useState(initial.vatNumber);
  const [paymentTerms, setPaymentTerms] = useState(initial.invoicePaymentTerms);
  const [vatRate, setVatRate] = useState(initial.invoiceDefaultVatRate);

  const isSwiss = country === "CH" || country === "FL";
  const ibanNormalized = qrIban ? normalizeIban(qrIban) : "";
  const ibanValid = ibanNormalized ? isValidIban(ibanNormalized) : true;
  const isQr = ibanNormalized ? isQrIban(ibanNormalized) : false;

  const submit = () => {
    setError(null);
    setSuccess(null);
    start(async () => {
      try {
        await updateInvoiceSettings({
          qrIban: isSwiss ? ibanNormalized : qrIban, // Keep original input if not validating Swiss QR format
          invoiceCreditorName: creditorName || undefined,
          vatNumber: vatNumber || undefined,
          invoicePaymentTerms: paymentTerms,
          invoiceDefaultVatRate: vatRate,
        });
        setSuccess("Banking settings saved.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1 md:col-span-2">
          <Label>
            {isSwiss ? "QR-IBAN *" : "Bank Account / IBAN"}{" "}
            <span className="text-xs text-muted-foreground font-normal">
              {isSwiss
                ? "(Swiss account, IID 30000-31999 for QR invoice)"
                : "(Standard bank account number or international IBAN)"}
            </span>
          </Label>
          <Input
            value={qrIban}
            onChange={(e) => setQrIban(e.target.value.toUpperCase())}
            placeholder={isSwiss ? "CH44 3199 9123 0008 8901 2" : "e.g. Bank/Account number or IBAN"}
            className="font-mono"
          />
          {isSwiss && ibanNormalized && (
            <div className="text-xs flex items-center gap-3">
              <span className="text-muted-foreground">
                Display: <span className="font-mono">{formatIbanDisplay(ibanNormalized)}</span>
              </span>
              {ibanValid ? (
                isQr ? (
                  <span className="text-emerald-700 font-medium">
                    ✓ valid QR-IBAN
                  </span>
                ) : (
                  <span className="text-amber-700">
                    Valid IBAN, but not a QR-IBAN — please request a separate QR account
                    from the bank.
                  </span>
                )
              ) : (
                <span className="text-destructive font-medium">
                  ⚠ Check digit incorrect
                </span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label>Account holder {isSwiss && "(display on QR invoice)"}</Label>
          <Input
            value={creditorName}
            onChange={(e) => setCreditorName(e.target.value)}
            placeholder={isSwiss ? "e.g. habb global Spritzwerk AG" : "e.g. HABB Global (PVT) LTD"}
          />
          <div className="text-xs text-muted-foreground">
            Leave empty for company name from master data.
          </div>
        </div>

        <div className="space-y-1">
          <Label>
            {country === "LK"
              ? "VAT / TIN No."
              : isSwiss
              ? "VAT no. (UID)"
              : "VAT Number (USt-IdNr.)"}
          </Label>
          <Input
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            placeholder={
              country === "LK"
                ? "e.g. Sri Lankan Tax Identification Number / VAT"
                : isSwiss
                ? "CHE-123.456.789 MWST"
                : "e.g. DE123456789"
            }
            className="font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label>Standard payment terms (days)</Label>
          <Input
            type="number"
            min={0}
            max={180}
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(Number(e.target.value))}
          />
        </div>

        <div className="space-y-1">
          <Label>Standard VAT rate (%)</Label>
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
        <Button onClick={submit} disabled={pending || (isSwiss && qrIban !== "" && !ibanValid)}>
          <Save className="h-4 w-4 mr-1" />
          {pending ? "Saving..." : "Save banking"}
        </Button>
      </div>
    </div>
  );
}
