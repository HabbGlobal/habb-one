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
            CODE_INVALID: "Code ungültig. Bitte erneut versuchen.",
            LOCKED: "Zu viele Fehlversuche. Bitte 15 Minuten warten.",
            RECOVERY_UNAVAILABLE:
              "Für diesen Account ist kein Notfall-Code eingerichtet.",
            NO_CEREMONY: "Sitzung abgelaufen. Bitte erneut mit Passwort anmelden.",
            INVALID_CEREMONY:
              "Sitzung abgelaufen. Bitte erneut mit Passwort anmelden.",
          };
          throw new Error(
            map[body?.error ?? ""] ?? "Notfall-Anmeldung fehlgeschlagen.",
          );
        }
        // TOTP gewährt KEINEN Zugang — zwingt zur Passkey-Neuregistrierung.
        router.replace("/owner/enroll-passkey");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      }
    });
  };

  const authenticate = () => {
    setError(null);
    start(async () => {
      try {
        const optsRes = await fetch("/api/owner/auth/passkey/signin-options");
        if (!optsRes.ok) throw new Error("Konnte Anmelde-Optionen nicht abrufen.");
        const options = await optsRes.json();

        const assertion = await startAuthentication({ optionsJSON: options });

        const verifyRes = await fetch("/api/owner/auth/passkey/signin-verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: assertion }),
        });
        if (!verifyRes.ok) throw new Error("Passkey-Anmeldung fehlgeschlagen.");

        router.replace("/owner");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unbekannter Fehler.";
        if (msg.includes("aborted") || msg.includes("cancelled")) {
          setError("Vorgang abgebrochen. Bitte erneut versuchen.");
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
        Anmelden mit Passkey
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
          Kein Passkey zur Hand? Notfall-Zugang mit Authenticator-Code
        </button>
      )}
      {recoveryAvailable && recoveryOpen && (
        <div className="space-y-3 rounded-lg border border-habb-line bg-habb-paper px-4 py-3.5">
          <p className="text-xs text-habb-muted">
            Gib den 6-stelligen Code aus deiner Authenticator-App ein. Danach
            musst du sofort einen neuen Passkey registrieren — der Notfall-Code
            allein gewährt no Zugang.
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
            Notfall-Anmeldung
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
