"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, X, Copy, CheckCheck } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { SudoPromptModal } from "./SudoPromptModal";
import { OWNER_ASSIGNABLE_ROLES } from "@/lib/owner/users";

const ROLE_LABEL: Record<UserRole, string> = {
  SUPERADMIN: "Super-Admin",
  ADMIN: "CEO / Geschäftsleitung",
  PLANNER: "Sekretariat",
  EMPLOYEE: "Produktion",
  CUSTOMER_PORTAL: "Kundenportal",
  KIOSK_OPERATOR: "Werkstatt-Tablet",
  SECRETARY: "Sekretariat (Legacy)",
  TEAM_LEAD: "Team-Lead (Legacy)",
};

type SendMode = "MAGIC_LINK" | "TEMP_PASSWORD";

interface Props {
  tenantId: string;
  tenantName: string;
}

export function CreateUserButton({ tenantId, tenantName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tempPwd, setTempPwd] = useState<{ password: string; email: string } | null>(null);
  const [mailDelivered, setMailDelivered] = useState<{ email: string; delivered: boolean } | null>(
    null,
  );
  const [showSudo, setShowSudo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Form state — kept in parent so SudoPromptModal can retry with the same data.
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("EMPLOYEE");
  const [sendMode, setSendMode] = useState<SendMode>("MAGIC_LINK");
  const [preferredLanguage, setPreferredLanguage] = useState("de");
  const [reason, setReason] = useState("");

  const reset = () => {
    setEmail("");
    setName("");
    setRole("EMPLOYEE");
    setSendMode("MAGIC_LINK");
    setPreferredLanguage("de");
    setReason("");
    setError(null);
  };

  const submit = () => {
    if (!email.trim() || !name.trim()) {
      setError("Email und Name sind Pflicht.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Begründung muss mindestens 10 Zeichen lang sein.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch(`/api/owner/tenants/${tenantId}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role,
          sendMode,
          preferredLanguage,
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
          setTempPwd({ password: json.tempPassword, email: email.trim().toLowerCase() });
        } else if (json.sendMode === "MAGIC_LINK") {
          setMailDelivered({ email: email.trim().toLowerCase(), delivered: json.mailDelivered });
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
            : "User konnte nicht angelegt werden."),
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
        <UserPlus className="h-3.5 w-3.5" />
        Neuer User
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-lg rounded-xl border border-habb-line bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-habb-ink">Neuer User</h2>
                <p className="text-xs text-habb-muted">für {tenantName}</p>
              </div>
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
              className="space-y-4 px-5 py-5"
              noValidate
            >
              <Field label="Email *">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  required
                  className={inputCls}
                  placeholder="vorname.nachname@firma.ch"
                />
              </Field>

              <Field label="Name *">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  className={inputCls}
                  placeholder="Vorname Nachname"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Role">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className={inputCls}
                  >
                    {OWNER_ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Sprache">
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

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-habb-muted">Password</legend>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-habb-line p-3 hover:bg-habb-paper">
                  <input
                    type="radio"
                    name="sendMode"
                    value="MAGIC_LINK"
                    checked={sendMode === "MAGIC_LINK"}
                    onChange={() => setSendMode("MAGIC_LINK")}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-habb-ink">
                    <span className="font-medium">Send magic link to user</span>
                    <span className="block text-xs text-habb-muted">
                      User receives mail with reset link (valid 1h) and sets password themselves.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-habb-line p-3 hover:bg-habb-paper">
                  <input
                    type="radio"
                    name="sendMode"
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

              <Field label="Begründung (Pflicht, ≥ 10 Zeichen)">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="z.B. Onboarding neue Sekretärin — Ticket #1234"
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

              <div className="flex justify-end gap-2">
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
      {mailDelivered && (
        <MailResultModal
          email={mailDelivered.email}
          delivered={mailDelivered.delivered}
          onClose={() => setMailDelivered(null)}
        />
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          submit();
        }}
        actionLabel="User anlegen"
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
          <h2 className="text-sm font-semibold text-habb-ink">User created — temporary password</h2>
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
                {copied ? (
                  <CheckCheck className="h-3.5 w-3.5 text-habb-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            </div>
          </div>
          <p className="text-xs text-habb-muted">
            User must set a new password on first login.
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
            User angelegt — Magic-Link {delivered ? "versendet" : "fehlgeschlagen"}
          </h2>
        </header>
        <div className="space-y-3 px-5 py-5 text-sm">
          {delivered ? (
            <p className="text-habb-ink">
              Mail to <span className="font-medium">{email}</span> ist raus. Der Link ist 1 Stunde
              gültig.
            </p>
          ) : (
            <>
              <p className="text-habb-red">
                Mail delivery to <span className="font-medium">{email}</span> failed.
              </p>
              <p className="text-habb-muted">
                Der User wurde trotzdem angelegt. Du kannst aus der User-Liste &quot;Passwort-Reset-Mail
                senden&quot; erneut auslösen.
              </p>
            </>
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
