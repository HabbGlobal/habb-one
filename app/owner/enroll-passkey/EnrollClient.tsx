"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { KeyRound, Loader2 } from "lucide-react";

export function EnrollClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const enroll = () => {
    setError(null);
    start(async () => {
      try {
        const optsRes = await fetch("/api/owner/auth/passkey/enroll-options");
        if (!optsRes.ok) throw new Error("Could not fetch registration options.");
        const options = await optsRes.json();

        const attestation = await startRegistration({ optionsJSON: options });

        const verifyRes = await fetch("/api/owner/auth/passkey/enroll-verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: attestation }),
        });
        if (!verifyRes.ok) throw new Error("Passkey verification failed.");

        router.replace("/owner");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error.";
        if (msg.includes("aborted") || msg.includes("cancelled")) {
          setError("Process aborted. Please try again.");
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
        onClick={enroll}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-habb-black px-5 py-3.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-habb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        <span>Register passkey now</span>
      </button>

      {error && (
        <p
          aria-live="polite"
          className="rounded-lg border border-habb-red/30 bg-habb-red/5 px-3.5 py-2.5 text-sm text-habb-red"
        >
          {error}
        </p>
      )}

      <div className="rounded-lg border border-habb-line bg-habb-paper px-4 py-3.5 text-xs text-habb-muted">
        <p className="font-medium text-habb-ink">What happens next</p>
        <ol className="mt-2 space-y-1.5 leading-relaxed">
          <li>1. Your browser will ask for Touch ID, Windows Hello, a security key, or iCloud Keychain.</li>
          <li>2. The private key never leaves your device — it is cryptographically bound to this domain.</li>
          <li>3. Future logins will require both your password and this passkey.</li>
        </ol>
      </div>
    </div>
  );
}
