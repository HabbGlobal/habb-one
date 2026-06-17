"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { KeyRound, Loader2, LifeBuoy } from "lucide-react";

export function SigninClient({
  recoveryAvailable = false,
}: {
  recoveryAvailable?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [code, setCode] = useState("");

  const recover = () => {
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/owner/auth/totp/recover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: code.trim() }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          const map: Record<string, string> = {
            CODE_INVALID: "Invalid code. Please try again.",
            LOCKED: "Too many failed attempts. Please wait 15 minutes.",
            RECOVERY_UNAVAILABLE:
              "No recovery code is set up for this account.",
            NO_CEREMONY: "Session expired. Please log in again with password.",
            INVALID_CEREMONY:
              "Session expired. Please log in again with password.",
          };
          throw new Error(
            map[body?.error ?? ""] ?? "Emergency login failed.",
          );
        }
        // TOTP does NOT grant access — forces passkey re-registration.
        router.replace("/owner/enroll-passkey");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error.");
      }
    });
  };

  const authenticate = () => {
    setError(null);
    start(async () => {
      try {
        const optsRes = await fetch("/api/owner/auth/passkey/signin-options");
        if (!optsRes.ok) throw new Error("Could not retrieve sign-in options.");
        const options = await optsRes.json();

        const assertion = await startAuthentication({ optionsJSON: options });

        const verifyRes = await fetch("/api/owner/auth/passkey/signin-verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: assertion }),
        });
        if (!verifyRes.ok) throw new Error("Passkey sign-in failed.");

        router.replace("/owner");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error.";
        if (msg.includes("aborted") || msg.includes("cancelled")) {
          setError("Process cancelled. Please try again.");
        } else {
          setError(msg);
        }
      }
    });
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={authenticate}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-habb-black px-5 py-3.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-habb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Sign in with passkey
      </button>

      {error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-habb-red/30 bg-habb-red/5 px-3.5 py-2.5 text-sm text-habb-red"
        >
          {error}
        </p>
      )}

      {recoveryAvailable && !recoveryOpen && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRecoveryOpen(true);
          }}
          className="inline-flex w-full items-center justify-center gap-2 text-xs text-habb-muted hover:text-habb-ink"
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          No passkey at hand? Emergency access with authenticator code
        </button>
      )}
      {recoveryAvailable && recoveryOpen && (
        <div className="space-y-3 rounded-lg border border-habb-line bg-habb-paper px-4 py-3.5">
          <p className="text-xs text-habb-muted">
            Enter the 6-digit code from your authenticator app. Afterwards
            you must immediately register a new passkey — the emergency code
            alone does not grant access.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="w-full rounded-lg border border-habb-line bg-white px-3.5 py-2.5 text-center text-lg tracking-[0.3em] tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red"
          />
          <button
            type="button"
            onClick={recover}
            disabled={pending || code.length !== 6}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-habb-black px-5 py-3 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Emergency login
          </button>
          <button
            type="button"
            onClick={() => setRecoveryOpen(false)}
            className="block w-full text-center text-xs text-habb-muted hover:text-habb-ink"
          >Cancel — back to passkey</button>
        </div>
      )}

      <p className="text-center text-xs text-habb-muted">
        <a href="/owner/login" className="text-habb-ink underline-offset-2 hover:underline">Back to login</a>
      </p>
    </div>
  );
}
