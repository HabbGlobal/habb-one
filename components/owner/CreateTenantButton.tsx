"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, Copy, CheckCheck, Building2 } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

type SendMode = "MAGIC_LINK" | "TEMP_PASSWORD";

export function CreateTenantButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showSudo, setShowSudo] = useState(false);
  const [tempPwd, setTempPwd] = useState<{ password: string; email: string } | null>(null);
  const [mailResult, setMailResult] = useState<{ email: string; delivered: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("CH");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("de");
  const [sendMode, setSendMode] = useState<SendMode>("MAGIC_LINK");
  const [reason, setReason] = useState("");

  const reset = () => {
    setCompanyName("");
    setPhone("");
    setAddress("");
    setCity("");
    setCountry("CH");
    setAdminName("");
    setAdminEmail("");
    setPreferredLanguage("de");
    setSendMode("MAGIC_LINK");
    setReason("");
    setError(null);
  };

  const submit = () => {
    if (!companyName.trim() || !phone.trim() || !adminName.trim() || !adminEmail.trim()) {
      setError("Firma, Phone, Admin-Name und Admin-Email sind Pflicht.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Begründung muss mindestens 10 Zeichen lang sein.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch("/api/owner/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          phone: phone.trim(),
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          country: country.trim().toUpperCase(),
          adminEmail: adminEmail.trim().toLowerCase(),
          adminName: adminName.trim(),
          preferredLanguage,
          sendMode,
          reason,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          tempPassword: string | null;
          mailDelivered: boolean;
          sendMode: SendMode;
        };
        setOpen(false);
        router.refresh();
        if (json.tempPassword) {
          setTempPwd({ password: json.tempPassword, email: adminEmail.trim().toLowerCase() });
        } else if (json.sendMode === "MAGIC_LINK") {
          setMailResult({ email: adminEmail.trim().toLowerCase(), delivered: json.mailDelivered });
        }
        reset();
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
      setError(
        json?.message ||
          (json?.error === "EMAIL_TAKEN"
            ? "Diese Email ist bereits vergeben."
            : "Tenant konnte nicht angelegt werden."),
      );
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-habb-black px-3.5 py-2 text-sm font-medium text-white hover:bg-habb-ink"
      >
        <Building2 className="h-3.5 w-3.5" />
        Neuer Tenant
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-2xl rounded-xl border border-habb-line bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
              <h2 className="text-sm font-semibold text-habb-ink">Neuer Tenant anlegen</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cancel"
                className="text-habb-muted hover:text-habb-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5"
              noValidate
            >
              <Section title="Company">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Firmenname *">
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className={inputCls} />
                  </Field>
                  <Field label="Phone *">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      placeholder="+41 79 123 45 67"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Adresse">
                    <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Ort">
                    <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Land">
                    <input
                      value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase())}
                      maxLength={3}
                      className={`${inputCls} uppercase`}
                    />
                  </Field>
                  <Field label="Standardsprache">
                    <select
                      value={preferredLanguage}
                      onChange={(e) => setPreferredLanguage(e.target.value)}
                      className={inputCls}
                    >
                      <option value="de">Deutsch</option>
                      <option value="fr">Français</option>
                      <option value="it">Italiano</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Administrator (SUPERADMIN)">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Name *">
                    <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required className={inputCls} />
                  </Field>
                  <Field label="Email *">
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                      className={inputCls}
                    />
                  </Field>
                </div>
                <fieldset className="mt-3 space-y-2">
                  <legend className="text-xs font-medium uppercase tracking-wide text-habb-muted">Password</legend>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-habb-line p-3 hover:bg-habb-paper">
                    <input
                      type="radio"
                      name="tenantSendMode"
                      value="MAGIC_LINK"
                      checked={sendMode === "MAGIC_LINK"}
                      onChange={() => setSendMode("MAGIC_LINK")}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-habb-ink">
                      <span className="font-medium">Send magic link to admin</span>
                      <span className="block text-xs text-habb-muted">
                        Admin receives reset mail (valid 1h), sets password themselves.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-habb-line p-3 hover:bg-habb-paper">
                    <input
                      type="radio"
                      name="tenantSendMode"
                      value="TEMP_PASSWORD"
                      checked={sendMode === "TEMP_PASSWORD"}
                      onChange={() => setSendMode("TEMP_PASSWORD")}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-habb-ink">
                      <span className="font-medium">Generate temporary password</span>
                      <span className="block text-xs text-habb-muted">
                        Shown once. You transmit it personally.
                      </span>
                    </span>
                  </label>
                </fieldset>
              </Section>

              <Field label="Begründung (Pflicht, ≥ 10 Zeichen)">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="z.B. Vertrag unterzeichnet — Onboarding Müller AG"
                  className={inputCls}
                />
              </Field>

              {error && (
                <p
                  aria-live="polite"
                  className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
                >
                  {error}
                </p>
              )}

              <p className="rounded-md border border-habb-line bg-habb-paper px-3 py-2 text-xs text-habb-muted">
                Der Tenant wird direkt aktiv geschaltet (Owner vouched). Der erste Admin
                bekommt automatisch SUPERADMIN-Rechte für seinen Tenanten.
              </p>

              <div className="flex justify-end gap-2 border-t border-habb-line pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Anlegen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tempPwd && <TempPasswordModal {...tempPwd} onClose={() => setTempPwd(null)} />}
      {mailResult && (
        <MailResultModal
          email={mailResult.email}
          delivered={mailResult.delivered}
          onClose={() => setMailResult(null)}
        />
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          submit();
        }}
        actionLabel="Neuen Tenanten anlegen"
      />
    </>
  );
}

const inputCls =
  "block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-habb-muted">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

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

function TempPasswordModal({
  password,
  email,
  onClose,
}: {
  password: string;
  email: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-habb-black/30 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
        <header className="border-b border-habb-line px-5 py-4">
          <h2 className="text-sm font-semibold text-habb-ink">Tenant angelegt — Admin-Passwort</h2>
        </header>
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-habb-ink">
            Transmit the password directly to <span className="font-medium">{email}</span>.
            After closing it is gone.
          </p>
          <div className="rounded-lg border border-habb-line bg-habb-paper px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <code className="block break-all font-mono text-base text-habb-ink">{password}</code>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
              >
                {copied ? <CheckCheck className="h-3.5 w-3.5 text-habb-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            </div>
          </div>
          <p className="text-xs text-habb-muted">
            Admin must set a new password on first login.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink"
            >
              Verstanden, schliessen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MailResultModal({
  email,
  delivered,
  onClose,
}: {
  email: string;
  delivered: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-habb-black/30 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
        <header className="border-b border-habb-line px-5 py-4">
          <h2 className="text-sm font-semibold text-habb-ink">
            Tenant angelegt — Magic-Link {delivered ? "versendet" : "fehlgeschlagen"}
          </h2>
        </header>
        <div className="space-y-3 px-5 py-5 text-sm">
          {delivered ? (
            <p className="text-habb-ink">
              Mail to <span className="font-medium">{email}</span> is sent. Link is valid for 1h.
            </p>
          ) : (
            <p className="text-habb-red">
              Mail delivery to <span className="font-medium">{email}</span> failed. Du
              kannst aus der User-Liste &quot;Passwort-Reset-Mail senden&quot; erneut auslösen.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
