"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X, Pencil } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";
import { COUNTRY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/company-locale";

export interface StammdatenInitial {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string;
  timezone: string;
  defaultLanguage: string;
  vatNumber: string | null;
  qrIban: string | null;
  invoiceCreditorName: string | null;
  invoicePaymentTerms: number;
}

interface Props {
  initial: StammdatenInitial;
}

const LANGUAGES: { value: string; label: string }[] = [
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
];

export function StammdatenForm({ initial }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSudo, setShowSudo] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pending, start] = useTransition();

  const cancel = () => {
    setForm(initial);
    setReason("");
    setError(null);
    setEditing(false);
  };

  const submit = (reasonText: string) => {
    if (reasonText.trim().length < 10) {
      setError("Reason must be at least 10 characters long.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/owner/tenants/${initial.id}/stammdaten`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          address: form.address ?? null,
          city: form.city ?? null,
          country: form.country,
          timezone: form.timezone,
          defaultLanguage: form.defaultLanguage,
          vatNumber: form.vatNumber ?? null,
          qrIban: form.qrIban ?? null,
          invoiceCreditorName: form.invoiceCreditorName ?? null,
          invoicePaymentTerms: form.invoicePaymentTerms,
          reason: reasonText,
        }),
      });
      if (res.ok) {
        setEditing(false);
        setReason("");
        setSavedFlash(true);
        router.refresh();
        setTimeout(() => setSavedFlash(false), 2500);
        return;
      }
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
          return;
        }
      }
      const json = await res.json().catch(() => ({}));
      setError(json?.message || "Save failed.");
    });
  };

  if (!editing) {
    return (
      <section className="rounded-lg border border-habb-line bg-white">
        <header className="flex items-center justify-between border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-medium text-habb-ink">Master data</h2>
          <div className="flex items-center gap-3">
            {savedFlash && <span className="text-xs text-habb-success">Saved</span>}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
            >
              <Pencil className="h-3.5 w-3.5" />Edit</button>
          </div>
        </header>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-4 sm:grid-cols-2">
          <Row label="Name" value={initial.name} />
          <Row label="Address" value={initial.address || "—"} />
          <Row label="City" value={initial.city || "—"} />
          <Row label="Country" value={initial.country} />
          <Row label="Timezone" value={initial.timezone} />
          <Row
            label="Default language"
            value={LANGUAGES.find((l) => l.value === initial.defaultLanguage)?.label ?? initial.defaultLanguage.toUpperCase()}
          />
          <Row label="VAT No." value={initial.vatNumber || "—"} />
          <Row label="QR-IBAN" value={initial.qrIban || "—"} mono />
          <Row label="Invoice recipient" value={initial.invoiceCreditorName || "—"} />
          <Row label="Payment terms" value={`${initial.invoicePaymentTerms} days`} />
        </dl>
      </section>
    );
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(reason);
        }}
        className="rounded-lg border border-habb-line bg-white"
      >
        <header className="flex items-center justify-between border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-medium text-habb-ink">Edit master data</h2>
        </header>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Name *">
            <input
              required
              minLength={2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="Country *">
            <select
              required
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              className={inputCls}
            >
              {/* also show current value if it's not in the list */}
              {!COUNTRY_OPTIONS.some((c) => c.code === form.country) && form.country && (
                <option value={form.country}>{form.country}</option>
              )}
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label} ({c.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Address">
            <input
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="City">
            <input
              value={form.city ?? ""}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className={inputCls}
            />
          </Field>

          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className={inputCls}
            >
              {!TIMEZONE_OPTIONS.some((t) => t.zone === form.timezone) && form.timezone && (
                <option value={form.timezone}>{form.timezone}</option>
              )}
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.zone} value={tz.zone}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Default language">
            <select
              value={form.defaultLanguage}
              onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value })}
              className={inputCls}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="VAT No.">
            <input
              value={form.vatNumber ?? ""}
              onChange={(e) => setForm({ ...form, vatNumber: e.target.value })}
              placeholder="CHE-123.456.789 MWST"
              className={inputCls}
            />
          </Field>

          <Field label="QR-IBAN">
            <input
              value={form.qrIban ?? ""}
              onChange={(e) => setForm({ ...form, qrIban: e.target.value })}
              placeholder="CH4431999123000889012"
              className={`${inputCls} font-mono`}
              maxLength={34}
            />
          </Field>

          <Field label="Invoice recipient">
            <input
              value={form.invoiceCreditorName ?? ""}
              onChange={(e) => setForm({ ...form, invoiceCreditorName: e.target.value })}
              placeholder="If different from company name"
              className={inputCls}
            />
          </Field>

          <Field label="Payment terms (days)">
            <input
              type="number"
              min={0}
              max={365}
              value={form.invoicePaymentTerms}
              onChange={(e) => setForm({ ...form, invoicePaymentTerms: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Reason (required, ≥ 10 characters)">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Address change — mail from customer on 12.05.2026"
                className={inputCls}
              />
            </Field>
          </div>

          {error && (
            <p
              aria-live="polite"
              className="sm:col-span-2 rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-habb-line px-5 py-3">
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-sm font-medium text-habb-ink hover:bg-habb-paper"
          >
            <X className="h-3.5 w-3.5" />Cancel</button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-1.5 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save</button>
        </footer>
      </form>

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          submit(reason);
        }}
        actionLabel="Edit master data"
      />
    </>
  );
}

const inputCls =
  "block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-habb-line/60 pb-2 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-habb-muted">{label}</dt>
      <dd className={`text-right text-sm font-medium text-habb-ink ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
