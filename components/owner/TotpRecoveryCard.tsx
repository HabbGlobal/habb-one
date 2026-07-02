"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Loader2, ShieldCheck, Trash2 } from "lucide-react";

/**
 * TOTP emergency access as a pure recovery factor. Passkey remains mandatory;
 * in an emergency, a TOTP code only unlocks passkey re-registration. This card
 * handles setup (QR + code confirmation) and removal.
 */
export function TotpRecoveryCard({ enrolled }: { enrolled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(
    null,
  );
  const [code, setCode] = useState("");

  const begin = () =>
    start(async () => {
      setError(null);
      const res = await fetch("/api/owner/auth/totp/setup", { method: "POST" });
      if (!res.ok) {
        setError("Setup failed.");
        return;
      }
      const body = (await res.json()) as { secret: string; qrDataUrl: string };
      setSetup({ secret: body.secret, qrDataUrl: body.qrDataUrl });
    });

  const confirm = () =>
    start(async () => {
      setError(null);
      const res = await fetch("/api/owner/auth/totp/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        setError("Invalid code — please enter the current code from the app.");
        return;
      }
      setSetup(null);
      setCode("");
      router.refresh();
    });

  const disable = () =>
    start(async () => {
      setError(null);
      const res = await fetch("/api/owner/auth/totp/disable", { method: "POST" });
      if (!res.ok) {
        setError("Removal failed.");
        return;
      }
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-habb-line bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-habb-paper">
          <LifeBuoy className="h-4 w-4 text-habb-ink" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-habb-ink">
            Emergency access (Authenticator app)
          </p>
          <p className="mt-1 text-sm text-habb-muted">
            Pure recovery factor against lockout. The passkey
            remains mandatory — a TOTP code grants <strong>no</strong>{" "}
            portal access, but only forces the registration of a new
            passkey.
          </p>

          {enrolled && !setup && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-habb-success/10 px-3 py-1 text-xs font-medium text-habb-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Configured
              </span>
              <button
                type="button"
                onClick={disable}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-habb-line px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />Remove</button>
              <button
                type="button"
                onClick={begin}
                disabled={pending}
                className="text-xs text-habb-muted underline-offset-2 hover:text-habb-ink hover:underline disabled:opacity-60"
              >
                Set up new
              </button>
            </div>
          )}

          {!enrolled && !setup && (
            <button
              type="button"
              onClick={begin}
              disabled={pending}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-xs font-medium text-white hover:bg-habb-ink disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Set up emergency access
            </button>
          )}

          {setup && (
            <div className="mt-4 space-y-3 rounded-lg border border-habb-line bg-habb-paper p-4">
              <p className="text-xs text-habb-muted">
                1. Scan the QR code with your authenticator app (Google
                Authenticator, 1Password, Authy …) or enter the key
                manually.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                alt="TOTP QR-Code"
                width={180}
                height={180}
                className="rounded-md border border-habb-line bg-white p-2"
              />
              <p className="break-all rounded-md border border-habb-line bg-white px-3 py-2 font-mono text-xs text-habb-ink">
                {setup.secret}
              </p>
              <p className="text-xs text-habb-muted">
                2. Enter the current 6-digit code to confirm:
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || code.length !== 6}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-habb-black px-4 py-2 text-xs font-medium text-white hover:bg-habb-ink disabled:opacity-60"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Confirm & activate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetup(null);
                    setCode("");
                  }}
                  className="rounded-md border border-habb-line px-4 py-2 text-xs font-medium text-habb-ink hover:bg-white"
                >Cancel</button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-habb-red/30 bg-habb-red/5 px-3.5 py-2.5 text-sm text-habb-red">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
