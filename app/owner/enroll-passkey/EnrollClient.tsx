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
        if (!optsRes.ok) throw new Error("Konnte Registrierungs-Optionen nicht abrufen.");
        const options = await optsRes.json();

        const attestation = await startRegistration({ optionsJSON: options });

        const verifyRes = await fetch("/api/owner/auth/passkey/enroll-verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response: attestation }),
        });
        if (!verifyRes.ok) throw new Error("Passkey-Verifizierung fehlgeschlagen.");

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
        onClick={enroll}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-habb-black px-5 py-3.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-habb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Passkey jetzt registrieren
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
        <p className="font-medium text-habb-ink">Was als nächstes passiert</p>
        <ol className="mt-2 space-y-1.5 leading-relaxed">
          <li>1. Dein Browser fragt nach Touch ID, Windows Hello, einem Sicherheitsschlüssel oder dem iCloud-Schlüsselbund.</li>
          <li>2. Der private Schlüssel verlässt dein Gerät nie — er wird kryptografisch an diese Domain gebunden.</li>
          <li>3. Künftige Anmeldungen erfolgen nur noch mit Passwort + diesem Passkey.</li>
        </ol>
      </div>
    </div>
  );
}
