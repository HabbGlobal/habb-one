"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

interface SuccessState {
  maskedEmail: string;
  mailDelivered: boolean;
}

export function RegisterForm({ plan }: { plan?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      companyName: String(form.get("companyName") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      address: String(form.get("address") ?? "").trim() || undefined,
      city: String(form.get("city") ?? "").trim() || undefined,
      country: String(form.get("country") ?? "CH").trim().toUpperCase(),
      adminName: String(form.get("adminName") ?? "").trim(),
      adminEmail: String(form.get("adminEmail") ?? "").trim().toLowerCase(),
      password: String(form.get("password") ?? ""),
      preferredLanguage: String(form.get("preferredLanguage") ?? "de"),
      // Auf der Preisseite gewählter Plan — Server validiert streng gegen
      // die Pricing-Definition; undefined => Default-Plan.
      plan: plan || undefined,
    };

    start(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = (await res.json()) as SuccessState;
        setSuccess(json);
        return;
      }
      const json = await res.json().catch(() => ({}));
      setError(json?.message || "Registrierung fehlgeschlagen. Bitte erneut versuchen.");
    });
  };

  if (success) {
    return (
      <div className="rounded-lg border border-habb-success/30 bg-habb-success/5 px-5 py-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-habb-success" />
          <div>
            <h2 className="text-base font-semibold text-habb-black">
              Bestätigungs-Mail unterwegs
            </h2>
            <p className="mt-1.5 text-sm text-habb-ink">
              Wir haben eine Mail an <span className="font-medium">{success.maskedEmail}</span>{" "}
              geschickt. Bitte klicken Sie auf den Link, um Ihre E-Mail-Adresse zu bestätigen.
            </p>
            {!success.mailDelivered && (
              <p className="mt-3 text-xs text-habb-warning">
                Hinweis: der Mail-Versand wurde noch nicht bestätigt. Falls Sie keine Mail
                erhalten, prüfen Sie den Spam-Ordner oder melden sich bei support@habb.ch.
              </p>
            )}
            <p className="mt-3 text-xs text-habb-muted">
              Nach der Bestätigung prüft das habb.ch Team Ihre Anfrage und gibt Ihren Zugang frei.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Section title="Firma">
        <Field label="Firmenname *">
          <input name="companyName" required minLength={2} className={inputCls} />
        </Field>
        <Field label="Telefonnummer *">
          <input
            name="phone"
            type="tel"
            required
            minLength={6}
            placeholder="+41 79 123 45 67"
            className={inputCls}
          />
        </Field>
        <Field label="Adresse">
          <input name="address" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ort">
            <input name="city" className={inputCls} />
          </Field>
          <Field label="Land">
            <input
              name="country"
              defaultValue="CH"
              maxLength={3}
              className={`${inputCls} uppercase`}
            />
          </Field>
        </div>
      </Section>

      <Section title="Administrator">
        <Field label="Name *">
          <input name="adminName" required minLength={2} className={inputCls} />
        </Field>
        <Field label="E-Mail *">
          <input
            name="adminEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            className={inputCls}
          />
        </Field>
        <Field label="Passwort *">
          <div className="relative">
            <input
              name="password"
              type={showPwd ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              className={`${inputCls} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Passwort verbergen" : "Passwort anzeigen"}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center text-habb-muted hover:text-habb-ink"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-habb-muted">Mindestens 8 Zeichen.</p>
        </Field>
        <Field label="Sprache">
          <select name="preferredLanguage" defaultValue="de" className={inputCls}>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>
        </Field>
      </Section>

      {error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-habb-red/30 bg-habb-red/5 px-3.5 py-2.5 text-sm text-habb-red"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-habb-black px-5 py-3.5 text-base font-medium text-white hover:bg-habb-ink disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Konto anlegen
      </button>

      <p className="text-center text-xs text-habb-muted">
        Mit dem Anlegen bestätigen Sie, dass die angegebenen Daten korrekt sind. Die Freigabe
        erfolgt manuell durch das habb.ch Team innert weniger Werktage.
      </p>
    </form>
  );
}

const inputCls =
  "block w-full rounded-lg border border-habb-line bg-white px-3.5 py-2.5 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-xs font-medium uppercase tracking-[0.16em] text-habb-muted">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-habb-ink">{label}</span>
      {children}
    </label>
  );
}
