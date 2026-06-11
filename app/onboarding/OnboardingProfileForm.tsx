"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

interface Initial {
  name: string;
  phone: string;
  address: string;
  city: string;
  country: string;
}

export function OnboardingProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await fetch("/api/admin/onboarding/stammdaten", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
        return;
      }
      const json = await res.json().catch(() => ({}));
      setError(json?.message || "Speichern fehlgeschlagen.");
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-habb-line bg-white"
      noValidate
    >
      <header className="flex items-center justify-between border-b border-habb-line px-5 py-3">
        <h2 className="text-sm font-medium text-habb-ink">Firmenprofil</h2>
        {saved && <span className="text-xs text-habb-success">Gespeichert</span>}
      </header>

      <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
        <Field label="Firmenname *" className="sm:col-span-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            minLength={2}
            className={inputCls}
          />
        </Field>
        <Field label="Telefon *">
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
            minLength={6}
            placeholder="+41 79 123 45 67"
            className={inputCls}
          />
        </Field>
        <Field label="Land">
          <input
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
            maxLength={3}
            className={`${inputCls} uppercase`}
          />
        </Field>
        <Field label="Adresse" className="sm:col-span-2">
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Ort">
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className={inputCls}
          />
        </Field>

        {error && (
          <p
            aria-live="polite"
            className="sm:col-span-2 rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
          >
            {error}
          </p>
        )}
      </div>

      <footer className="flex justify-end border-t border-habb-line px-5 py-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Speichern
        </button>
      </footer>
    </form>
  );
}

const inputCls =
  "block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
