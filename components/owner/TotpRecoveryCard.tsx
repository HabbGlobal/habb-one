"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, Loader2, ShieldCheck, Trash2 } from "lucide-react";

/**
 * TOTP-Notfall-Zugang (reiner Recovery-Faktor). Passkey bleibt Pflicht;
 * ein TOTP-Code schaltet im Notfall nur die Passkey-Neuregistrierung
 * frei. Hier: einrichten (QR + Code-Bestätigung) bzw. entfernen.
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
        setError("Einrichtung fehlgeschlagen.");
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
        setError("Code ungültig — bitte den aktuellen Code aus der App eingeben.");
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
        setError("Entfernen fehlgeschlagen.");
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
            Notfall-Zugang (Authenticator-App)
          </p>
          <p className="mt-1 text-sm text-habb-muted">
            Reiner Wiederherstellungs-Faktor gegen Aussperren. Der Passkey
            bleibt Pflicht — ein TOTP-Code gewährt <strong>keinen</strong>{" "}
            Portalzugang, sondern erzwingt nur die Registrierung eines neuen
            Passkeys.
          </p>

          {enrolled && !setup && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-habb-success/10 px-3 py-1 text-xs font-medium text-habb-success">
                <ShieldCheck className="h-3.5 w-3.5" /> Eingerichtet
              </span>
              <button
                type="button"
                onClick={disable}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-habb-line px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Entfernen
              </button>
              <button
                type="button"
                onClick={begin}
                disabled={pending}
                className="text-xs text-habb-muted underline-offset-2 hover:text-habb-ink hover:underline disabled:opacity-60"
              >
                Neu einrichten
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
              Notfall-Zugang einrichten
            </button>
          )}

          {setup && (
            <div className="mt-4 space-y-3 rounded-lg border border-habb-line bg-habb-paper p-4">
              <p className="text-xs text-habb-muted">
                1. Scanne den QR-Code mit deiner Authenticator-App (Google
                Authenticator, 1Password, Authy …) oder gib den Schlüssel
                manuell ein.
              </p>
              <Image
                src={setup.qrDataUrl}
                alt="TOTP QR-Code"
                width={180}
                height={180}
                unoptimized
                className="rounded-md border border-habb-line bg-white p-2"
              />
              <p className="break-all rounded-md border border-habb-line bg-white px-3 py-2 font-mono text-xs text-habb-ink">
                {setup.secret}
              </p>
              <p className="text-xs text-habb-muted">
                2. Gib zur Bestätigung den aktuellen 6-stelligen Code ein:
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
                  Bestätigen & aktivieren
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetup(null);
                    setCode("");
                  }}
                  className="rounded-md border border-habb-line px-4 py-2 text-xs font-medium text-habb-ink hover:bg-white"
                >
                  Abbrechen
                </button>
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
