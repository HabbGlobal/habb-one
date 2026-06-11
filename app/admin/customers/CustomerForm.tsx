"use client";

// Customer master-data form. Used both for create (with optional initial
// address + contact) and update flows. Triggers a duplicate-check before
// submit so the user can re-evaluate when a likely duplicate exists.
//
// Validierung läuft client-seitig mit demselben Zod-Schema wie auf dem
// Server. Field-level Fehler werden direkt unter den Inputs gerendert,
// zusätzlich ein Summary-Banner oben. HTML5-`required` ist bewusst NICHT
// gesetzt, weil die Browser-Tooltips bei langen Formularen vom User oft
// übersehen werden ("ich klicke Speichern, passiert nichts").

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { checkDuplicates, createCustomer, updateCustomer } from "./actions";
import type { DuplicateMatch } from "@/lib/customer/duplicates";
import {
  customerCoreSchema,
  addressSchema,
  contactSchema,
} from "@/lib/validation/customer";

export interface CustomerFormData {
  type: "PRIVATE" | "BUSINESS";
  companyName: string;
  vatNumber: string;
  language: "DE" | "FR" | "IT" | "EN";
  paymentTerms: number;
  defaultDiscount: string; // form value (string for empty handling)
  creditLimit: string;
  notes: string;
  isActive: boolean;
  // Optional initial entries (create flow only):
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  contactFirstName?: string;
  contactLastName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export const DEFAULT_CUSTOMER_FORM: CustomerFormData = {
  type: "BUSINESS",
  companyName: "",
  vatNumber: "",
  language: "DE",
  paymentTerms: 30,
  defaultDiscount: "",
  creditLimit: "",
  notes: "",
  isActive: true,
  street: "",
  zip: "",
  city: "",
  country: "CH",
  contactFirstName: "",
  contactLastName: "",
  contactEmail: "",
  contactPhone: "",
};

interface Props {
  initial: CustomerFormData;
  mode:
    | { kind: "create" }
    | { kind: "edit"; customerId: string };
}

export function CustomerForm({ initial, mode }: Props) {
  const router = useRouter();
  const [data, setData] = useState<CustomerFormData>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [duplicateCheckPending, setDupPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const update = <K extends keyof CustomerFormData>(k: K, v: CustomerFormData[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    // Optimistisch: sobald der User in einem Feld editiert, dort den
    // Inline-Fehler ausblenden — die nächste Submit-Validierung entscheidet
    // neu. Sonst bleiben alte Fehlermeldungen hängen, was verwirrt.
    setFieldErrors((prev) => {
      if (!prev[k as string]) return prev;
      const next = { ...prev };
      delete next[k as string];
      return next;
    });
  };

  const runDuplicateCheck = async () => {
    setDupPending(true);
    try {
      const result = await checkDuplicates({
        vatNumber: data.vatNumber || undefined,
        companyName: data.companyName || undefined,
        zip: data.zip || undefined,
        primaryEmail: data.contactEmail || undefined,
        excludeId: mode.kind === "edit" ? mode.customerId : undefined,
      });
      setDuplicates(result);
    } catch (err) {
      // Silent — duplicate check is advisory.
      console.error("Duplicate check failed:", err);
    } finally {
      setDupPending(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // ─── 1. Core-Stammdaten validieren ──────────────────────────────
    const coreCandidate = {
      type: data.type,
      companyName: data.companyName.trim() || undefined,
      vatNumber: data.vatNumber.trim() || undefined,
      language: data.language,
      paymentTerms: data.paymentTerms,
      defaultDiscount:
        data.defaultDiscount === "" ? null : Number(data.defaultDiscount),
      creditLimit: data.creditLimit === "" ? null : Number(data.creditLimit),
      notes: data.notes.trim() || undefined,
      isActive: data.isActive,
    };
    const coreResult = customerCoreSchema.safeParse(coreCandidate);

    // Issues sammeln pro Feldpfad → der erste Fehler je Feld gewinnt.
    const issues: Record<string, string> = {};
    if (!coreResult.success) {
      for (const i of coreResult.error.issues) {
        const key = i.path.join(".") || "_root";
        if (!issues[key]) issues[key] = i.message;
      }
    }

    // ─── 2. Adresse "all or nothing" (nur bei create) ───────────────
    let initialAddress: ReturnType<typeof addressSchema.parse> | undefined;
    if (mode.kind === "create") {
      const street = data.street?.trim() ?? "";
      const zip = data.zip?.trim() ?? "";
      const city = data.city?.trim() ?? "";
      const country = (data.country ?? "CH").trim().toUpperCase();
      const anyAddress = street || zip || city;
      if (anyAddress) {
        // Mindestens ein Adressfeld ist gesetzt → ALLE müssen valide sein.
        const r = addressSchema.safeParse({
          type: "BOTH" as const,
          street,
          zip,
          city,
          country,
          isDefault: true,
        });
        if (r.success) {
          initialAddress = r.data;
        } else {
          for (const i of r.error.issues) {
            const key = i.path.join(".") || "address";
            if (!issues[key]) issues[key] = i.message;
          }
        }
      }
    }

    // ─── 3. Kontakt "all or nothing" (nur bei create) ───────────────
    let initialContact: ReturnType<typeof contactSchema.parse> | undefined;
    if (mode.kind === "create") {
      const fn = data.contactFirstName?.trim() ?? "";
      const ln = data.contactLastName?.trim() ?? "";
      const email = data.contactEmail?.trim() ?? "";
      const phone = data.contactPhone?.trim() ?? "";
      const anyContact = fn || ln || email || phone;
      if (anyContact) {
        const r = contactSchema.safeParse({
          firstName: fn,
          lastName: ln,
          email: email || undefined,
          phone: phone || undefined,
          isPrimary: true,
        });
        if (r.success) {
          initialContact = r.data;
        } else {
          for (const i of r.error.issues) {
            // Mapping auf die Formularfeld-Namen
            const path = i.path.join(".");
            const key =
              path === "firstName"
                ? "contactFirstName"
                : path === "lastName"
                  ? "contactLastName"
                  : path === "email"
                    ? "contactEmail"
                    : path === "phone"
                      ? "contactPhone"
                      : "contact";
            if (!issues[key]) issues[key] = i.message;
          }
        }
      }
    }

    // ─── 4. Wenn irgendein Fehler → anzeigen + zur Summary scrollen ──
    if (Object.keys(issues).length > 0) {
      setFieldErrors(issues);
      setError(
        `Bitte ${Object.keys(issues).length === 1 ? "das markierte Feld korrigieren" : "die markierten Felder korrigieren"}.`,
      );
      // Damit der User die Fehlermeldung garantiert sieht, scrollen wir
      // die Summary-Banner-Position in den sichtbaren Bereich.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    // ─── 5. Absenden ─────────────────────────────────────────────────
    const core = coreResult.success ? coreResult.data : coreCandidate;
    start(async () => {
      try {
        if (mode.kind === "create") {
          const result = await createCustomer({
            core,
            initialAddress,
            initialContact,
          });
          router.push(`/admin/customers/${result.id}`);
          router.refresh();
        } else {
          await updateCustomer(mode.customerId, core);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern");
        requestAnimationFrame(() => {
          summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
    });
  };

  const isEdit = mode.kind === "edit";

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {/* Summary-Banner: erscheint bei Validierungs- ODER Server-Fehler.
          Wird beim Submit in den sichtbaren Bereich gescrollt, damit der
          User nicht denkt "passiert nichts". */}
      <div ref={summaryRef}>
        {error && (
          <Card className="border-habb-red/40 bg-habb-red/5">
            <CardContent className="p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-habb-red shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-habb-red-dark">{error}</p>
                {Object.keys(fieldErrors).length > 0 && (
                  <ul className="space-y-0.5 text-habb-ink">
                    {Object.entries(fieldErrors).map(([field, msg]) => (
                      <li key={field}>
                        <span className="font-medium">{labelFor(field)}:</span> {msg}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Typ">
            <Select
              value={data.type}
              onChange={(e) => update("type", e.target.value as "PRIVATE" | "BUSINESS")}
            >
              <option value="BUSINESS">Geschäftskunde</option>
              <option value="PRIVATE">Privatkunde</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={data.isActive ? "1" : "0"}
              onChange={(e) => update("isActive", e.target.value === "1")}
            >
              <option value="1">Aktiv</option>
              <option value="0">Inaktiv</option>
            </Select>
          </Field>
          <Field
            label={
              data.type === "BUSINESS"
                ? "Firmenname *"
                : "Firmenname (optional)"
            }
            full
            error={fieldErrors.companyName}
          >
            <Input
              value={data.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              onBlur={runDuplicateCheck}
              aria-invalid={!!fieldErrors.companyName}
            />
          </Field>
          <Field label="MwSt-Nummer (optional)" error={fieldErrors.vatNumber}>
            <Input
              value={data.vatNumber}
              onChange={(e) => update("vatNumber", e.target.value)}
              placeholder="CHE-123.456.789 MWST"
              onBlur={runDuplicateCheck}
              aria-invalid={!!fieldErrors.vatNumber}
            />
          </Field>
          <Field label="Sprache">
            <Select
              value={data.language}
              onChange={(e) => update("language", e.target.value as CustomerFormData["language"])}
            >
              <option value="DE">Deutsch</option>
              <option value="FR">Französisch</option>
              <option value="IT">Italienisch</option>
              <option value="EN">Englisch</option>
            </Select>
          </Field>
          <Field label="Zahlungsfrist (Tage)" error={fieldErrors.paymentTerms}>
            <Input
              type="number"
              min={0}
              max={180}
              value={data.paymentTerms}
              onChange={(e) => update("paymentTerms", Number(e.target.value || 0))}
            />
          </Field>
          <Field label="Standard-Rabatt (%)" error={fieldErrors.defaultDiscount}>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={data.defaultDiscount}
              onChange={(e) => update("defaultDiscount", e.target.value)}
              placeholder="leer = kein Rabatt"
            />
          </Field>
          <Field label="Kreditlimit (CHF)" error={fieldErrors.creditLimit}>
            <Input
              type="number"
              min={0}
              step={100}
              value={data.creditLimit}
              onChange={(e) => update("creditLimit", e.target.value)}
              placeholder="leer = kein Limit"
            />
          </Field>
          <Field label="Notizen (intern)" full>
            <Textarea
              rows={3}
              value={data.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* On create only: optional initial address + contact, so the user can
          provision a usable customer record from a single form. "All or
          nothing" — sobald EIN Feld gefüllt ist, müssen alle nötigen gefüllt
          sein (sonst Inline-Fehler). */}
      {!isEdit && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Erste Adresse (optional, aber komplett wenn ausgefüllt)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Strasse + Nr." full error={fieldErrors.street}>
                <Input
                  value={data.street ?? ""}
                  onChange={(e) => update("street", e.target.value)}
                  aria-invalid={!!fieldErrors.street}
                />
              </Field>
              <Field label="PLZ" error={fieldErrors.zip}>
                <Input
                  value={data.zip ?? ""}
                  onChange={(e) => update("zip", e.target.value)}
                  onBlur={runDuplicateCheck}
                  aria-invalid={!!fieldErrors.zip}
                />
              </Field>
              <Field label="Ort" error={fieldErrors.city}>
                <Input
                  value={data.city ?? ""}
                  onChange={(e) => update("city", e.target.value)}
                  aria-invalid={!!fieldErrors.city}
                />
              </Field>
              <Field label="Land" error={fieldErrors.country}>
                <Input
                  value={data.country ?? "CH"}
                  maxLength={2}
                  onChange={(e) => update("country", e.target.value.toUpperCase())}
                  aria-invalid={!!fieldErrors.country}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Erster Kontakt (optional, aber komplett wenn ausgefüllt)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Vorname" error={fieldErrors.contactFirstName}>
                <Input
                  value={data.contactFirstName ?? ""}
                  onChange={(e) => update("contactFirstName", e.target.value)}
                  aria-invalid={!!fieldErrors.contactFirstName}
                />
              </Field>
              <Field label="Nachname" error={fieldErrors.contactLastName}>
                <Input
                  value={data.contactLastName ?? ""}
                  onChange={(e) => update("contactLastName", e.target.value)}
                  aria-invalid={!!fieldErrors.contactLastName}
                />
              </Field>
              <Field label="E-Mail" error={fieldErrors.contactEmail}>
                <Input
                  type="email"
                  value={data.contactEmail ?? ""}
                  onChange={(e) => update("contactEmail", e.target.value)}
                  onBlur={runDuplicateCheck}
                  aria-invalid={!!fieldErrors.contactEmail}
                />
              </Field>
              <Field label="Telefon" error={fieldErrors.contactPhone}>
                <Input
                  value={data.contactPhone ?? ""}
                  onChange={(e) => update("contactPhone", e.target.value)}
                  aria-invalid={!!fieldErrors.contactPhone}
                />
              </Field>
            </CardContent>
          </Card>
        </>
      )}

      {/* Soft-warning when potential duplicates exist. The user can still
          submit — duplicates are sometimes intentional (subsidiaries etc.). */}
      {duplicates.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-semibold">
                {duplicates.length === 1
                  ? "Möglicher Dublikat-Treffer:"
                  : `${duplicates.length} mögliche Dublikate:`}
              </p>
              <ul className="space-y-0.5">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/admin/customers/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-amber-900"
                    >
                      {d.customerNumber} · {d.displayName}
                    </a>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({d.matchedOn.map(matchReason).join(", ")})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Du kannst trotzdem speichern, falls es sich um eine separate
                Buchungseinheit handelt.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {duplicateCheckPending && (
        <p className="text-xs text-muted-foreground">Prüfe auf Dublikate …</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {isEdit ? "Speichern" : "Kunde anlegen"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/** Übersetzt einen Feld-Pfad in das deutsche Label, das im Summary-Banner
 *  oben angezeigt wird. Bewusst handgepflegt, weil Zod-Pfade
 *  (z.B. "companyName", "vatNumber") für den User nicht selbsterklärend sind. */
function labelFor(field: string): string {
  const map: Record<string, string> = {
    companyName: "Firmenname",
    vatNumber: "MwSt-Nummer",
    paymentTerms: "Zahlungsfrist",
    defaultDiscount: "Standard-Rabatt",
    creditLimit: "Kreditlimit",
    street: "Strasse",
    zip: "PLZ",
    city: "Ort",
    country: "Land",
    contactFirstName: "Vorname Kontakt",
    contactLastName: "Nachname Kontakt",
    contactEmail: "E-Mail Kontakt",
    contactPhone: "Telefon Kontakt",
    _root: "Formular",
  };
  return map[field] ?? field;
}

function matchReason(r: DuplicateMatch["matchedOn"][number]): string {
  return {
    vatNumber: "MwSt-Nr identisch",
    companyAndZip: "Firma + PLZ identisch",
    primaryEmail: "Haupt-E-Mail identisch",
  }[r];
}

function Field({
  label,
  children,
  full,
  error,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  /** Inline-Fehler unter dem Feld. Färbt zusätzlich das Label rot. */
  error?: string;
}) {
  return (
    <div className={`space-y-1 ${full ? "md:col-span-2" : ""}`}>
      <Label className={error ? "text-habb-red-dark" : undefined}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-habb-red-dark flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
