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
 * "Sign in as" button + two-stage modal flow.
 *  Stage 1: Reason + Scope + Duration → POST /request → OTP is sent to customer
 *  Stage 2: Owner enters OTP that they requested personally from the customer
 *           POST /verify → Cookie is set → Redirect to /admin
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
      setError("Reason must be at least 10 characters long.");
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
      setError("Please enter the 6-digit code.");
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
          setError("Code is incorrect.");
        } else if (json?.error === "TOO_MANY_ATTEMPTS") {
          setError("Too many failed attempts — code is locked. Please request a new one.");
        } else if (json?.error === "TOKEN_EXPIRED") {
          setError("Code has expired — please request a new one.");
        } else if (json?.error === "TOKEN_USED") {
          setError("Code has already been used or cancelled.");
        } else {
          setError("Verification failed.");
        }
        return;
      }
      const data = await res.json();
      // Cookie is set → go to tenant app
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
            We will send a 6-digit code via email to{" "}
            <span className="text-habb-ink">{user.email}</span>. The customer must
            pass the code personally before the session starts.
          </p>

          <Field
            label="Reason (required, ≥ 10 characters)"
            value={reason}
            onChange={setReason}
            placeholder="e.g. Customer reports error when creating a quote"
            multiline
          />
          <Field
            label="Ticket reference (optional)"
            value={ticketRef}
            onChange={setTicketRef}
            placeholder="e.g. SUP-1284"
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
                    {m} minutes
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
        <ModalShell title="Enter code from customer" onClose={cancelConsent}>
          <div className="rounded-lg border border-habb-line bg-habb-paper px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-habb-success">
              <Shield className="h-3.5 w-3.5" />
              <span className="font-medium">Code sent</span>
            </div>
            <p className="mt-1 text-habb-ink">
              Recipient:{" "}
              <span className="font-mono">{consent.targetEmailMasked}</span>
            </p>
            <p className="mt-0.5 text-xs text-habb-muted">
              {consent.emailDelivered
                ? `Valid until ${new Date(consent.expiresAt).toLocaleTimeString("de-CH")}`
                : "Email delivery uncertain — please call the customer directly."}
            </p>
          </div>

          <p className="text-sm text-habb-ink">
            Please ask the customer for the code verbally and enter it here.
            The code was not displayed anywhere else — it exists exclusively
            in the customer&apos;s email.
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
              <p className="mt-1 text-xs text-habb-muted">
              {attemptsLeft} attempts remaining, then the code will be locked.
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

// ─── Small UI building blocks, kept inline so the component is self-contained

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
            aria-label="Close"
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
      return "Target user was not found.";
    case "USER_DELETED":
      return "Target user is deleted — impersonation not possible.";
    case "USER_LOCKED":
      return "Target user is locked — please unlock first.";
    case "USER_INACTIVE":
      return "Target user is inactive.";
    case "COMPANY_SUSPENDED":
      return "Tenant is suspended — impersonation not possible.";
    case "INVALID":
      return message || "Input invalid.";
    default:
      return message || "Request failed.";
  }
}
