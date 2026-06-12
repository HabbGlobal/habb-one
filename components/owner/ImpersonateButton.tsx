"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, Shield, X } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

interface Props {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

type Scope = "READONLY" | "FULL";

interface ConsentInfo {
  consentTokenId: string;
  expiresAt: string;
  targetEmailMasked: string;
  emailDelivered: boolean;
}

const DURATION_OPTIONS = [15, 30, 60, 120, 240];

/**
 * "Sign in as"-Button + zweistufiger Modal-Flow.
 *  Stufe 1: Reason + Scope + Dauer → POST /request → OTP geht an Kunde
 *  Stufe 2: Owner tippt OTP, den er vom Kunden persönlich erfragt
 *           POST /verify → Cookie wird gesetzt → Redirect nach /admin
 */
export function ImpersonateButton({ user }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<"closed" | "request" | "otp">("closed");
  const [showSudo, setShowSudo] = useState(false);
  const [reason, setReason] = useState("");
  const [ticketRef, setTicketRef] = useState("");
  const [scope, setScope] = useState<Scope>("READONLY");
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [consent, setConsent] = useState<ConsentInfo | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setStage("closed");
    setShowSudo(false);
    setReason("");
    setTicketRef("");
    setScope("READONLY");
    setDurationMinutes(30);
    setConsent(null);
    setOtp("");
    setError(null);
    setAttemptsLeft(null);
  }

  function submitRequest() {
    if (reason.trim().length < 10) {
      setError("Begründung muss mindestens 10 Zeichen lang sein.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch("/api/owner/impersonation/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: user.id,
          reason: reason.trim(),
          ticketRef: ticketRef.trim() || null,
          scope,
          durationMinutes,
        }),
      });
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
          return;
        }
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(labelRequestError(json?.error, json?.message));
        return;
      }
      const data = (await res.json()) as ConsentInfo;
      setConsent(data);
      setStage("otp");
    });
  }

  function submitOtp() {
    if (!consent) return;
    if (!/^\d{6}$/.test(otp)) {
      setError("Bitte den 6-stelligen Code eingeben.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch("/api/owner/impersonation/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentTokenId: consent.consentTokenId, otp }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "WRONG_OTP") {
          setAttemptsLeft(json?.attemptsLeft ?? null);
          setError("Code stimmt nicht.");
        } else if (json?.error === "TOO_MANY_ATTEMPTS") {
          setError("Zu viele Fehlversuche — Code ist gesperrt. Bitte neu anfordern.");
        } else if (json?.error === "TOKEN_EXPIRED") {
          setError("Code ist abgelaufen — bitte neu anfordern.");
        } else if (json?.error === "TOKEN_USED") {
          setError("Code wurde schon verwendet oder abgebrochen.");
        } else {
          setError("Verifikation fehlgeschlagen.");
        }
        return;
      }
      const data = await res.json();
      // Cookie ist gesetzt → ab in die Tenant-App
      router.push(data.redirectTo || "/admin");
    });
  }

  function cancelConsent() {
    if (!consent) {
      close();
      return;
    }
    start(async () => {
      await fetch("/api/owner/impersonation/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentTokenId: consent.consentTokenId }),
      });
      close();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setStage("request")}
        className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in as
      </button>

      {stage === "request" && (
        <ModalShell title={`Sign in as ${user.name}`} onClose={close}>
          <p className="text-sm text-habb-muted">
            Wir senden einen 6-stelligen Code per Email an{" "}
            <span className="text-habb-ink">{user.email}</span>. Der Kunde muss
            den Code persönlich weitergeben, bevor die Sitzung startet.
          </p>

          <Field
            label="Begründung (Pflicht, ≥ 10 Zeichen)"
            value={reason}
            onChange={setReason}
            placeholder="z.B. Kunde meldet Fehler beim Anlegen einer Offerte"
            multiline
          />
          <Field
            label="Ticket-Referenz (optional)"
            value={ticketRef}
            onChange={setTicketRef}
            placeholder="z.B. SUP-1284"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
                Permission
              </label>
              <div className="flex gap-2">
                <ScopePill active={scope === "READONLY"} onClick={() => setScope("READONLY")}>
                  Read only
                </ScopePill>
                <ScopePill active={scope === "FULL"} onClick={() => setScope("FULL")}>
                  Full access
                </ScopePill>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
                Max duration
              </label>
              <select
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} Minuten
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <ModalFooter>
            <CancelButton onClick={close}>Cancel</CancelButton>
            <PrimaryButton onClick={submitRequest} pending={pending}>
              Send code
            </PrimaryButton>
          </ModalFooter>
        </ModalShell>
      )}

      {stage === "otp" && consent && (
        <ModalShell title="Code vom Kunden eingeben" onClose={cancelConsent}>
          <div className="rounded-lg border border-habb-line bg-habb-paper px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-habb-success">
              <Shield className="h-3.5 w-3.5" />
              <span className="font-medium">Code sent</span>
            </div>
            <p className="mt-1 text-habb-ink">
              Empfänger:{" "}
              <span className="font-mono">{consent.targetEmailMasked}</span>
            </p>
            <p className="mt-0.5 text-xs text-habb-muted">
              {consent.emailDelivered
                ? `Gültig bis ${new Date(consent.expiresAt).toLocaleTimeString("de-CH")}`
                : "Email-Zustellung unsicher — bitte Kunden direkt anrufen."}
            </p>
          </div>

          <p className="text-sm text-habb-ink">
            Bitte den Code mündlich vom Kunden erfragen und hier eintippen.
            Der Code wurde nirgendwo sonst angezeigt — er lebt ausschließlich
            in der Email des Kunden.
          </p>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
              6-digit confirmation code
            </label>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-lg font-mono tracking-[0.4em] text-center focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
            />
            {attemptsLeft !== null && attemptsLeft >= 0 && (
              <p className="mt-1 text-xs text-habb-warning">
                Noch {attemptsLeft} Versuche, danach wird der Code gesperrt.
              </p>
            )}
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <ModalFooter>
            <CancelButton onClick={cancelConsent}>Cancel + lock code</CancelButton>
            <PrimaryButton onClick={submitOtp} pending={pending}>
              Start session
            </PrimaryButton>
          </ModalFooter>
        </ModalShell>
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          submitRequest();
        }}
        actionLabel={`Sign in as ${user.name}`}
      />
    </>
  );
}

// ─── kleine UI-Bausteine, inline gelassen damit die Komponente self-contained ist

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
          <h2 className="text-sm font-semibold text-habb-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schliessen"
            className="text-habb-muted hover:text-habb-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-4 px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}

function CancelButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  onClick,
  pending,
  children,
}: {
  onClick: () => void;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p
      aria-live="polite"
      className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red-dark"
    >
      {children}
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
        />
      )}
    </div>
  );
}

function ScopePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-habb-black px-3 py-1.5 text-xs font-medium text-white"
          : "rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
      }
    >
      {children}
    </button>
  );
}

function labelRequestError(code?: string, message?: string): string {
  switch (code) {
    case "USER_NOT_FOUND":
      return "Ziel-User wurde nicht gefunden.";
    case "USER_DELETED":
      return "Ziel-User ist gelöscht — Impersonation nicht möglich.";
    case "USER_LOCKED":
      return "Ziel-User ist gesperrt — bitte erst entsperren.";
    case "USER_INACTIVE":
      return "Ziel-User ist inaktiv.";
    case "COMPANY_SUSPENDED":
      return "Tenant ist suspendiert — Impersonation nicht möglich.";
    case "INVALID":
      return message || "Eingabe ungültig.";
    default:
      return message || "Anfrage fehlgeschlagen.";
  }
}
