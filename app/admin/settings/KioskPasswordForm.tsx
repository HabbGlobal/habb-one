"use client";

// Kiosk-Passwort verwalten — schützt das Werkstatt-iPad vor öffentlichem
// Zugriff. Beim ersten /kiosk-Zugriff wird dieses Passwort einmal
// eingegeben, danach bleibt das Tablet freigeschaltet. Wie lange genau,
// regelt der separate "Kiosk Auto-Logout"-Block (Default: nie ausloggen).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, ShieldOff, ShieldCheck } from "lucide-react";
import { setKioskPassword, clearKioskPassword } from "./actions";

interface Props {
  hasKioskPassword: boolean;
}

export function KioskPasswordForm({ hasKioskPassword }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (pw.length < 4) {
      setError("Passwort braucht mindestens 4 Zeichen.");
      return;
    }
    if (pw !== pwConfirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    start(async () => {
      try {
        await setKioskPassword({ password: pw });
        setSuccess(
          hasKioskPassword
            ? "Kiosk-Passwort geändert."
            : "Kiosk-Passwort gesetzt. Das iPad muss jetzt einmal entsperrt werden.",
        );
        setPw("");
        setPwConfirm("");
        router.refresh();
        setTimeout(() => setSuccess(null), 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
      }
    });
  };

  const remove = () => {
    if (
      !confirm(
        "Kiosk-Passwort wirklich entfernen? Das iPad ist danach OHNE Passwort erreichbar.",
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await clearKioskPassword();
        setSuccess("Kiosk-Passwort entfernt.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" /> Kiosk-Passwort
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Schützt das Werkstatt-iPad vor unautorisiertem Zugriff. Sekretärin
            oder Werkstattleiter geben das Passwort einmal beim Einrichten
            ein, danach bleibt das Tablet freigeschaltet. Wie lange genau —
            oder ob es <em>nie</em> automatisch ausloggt (Default für
            Werkstatt-Tablets) — regelt der Block {`„Kiosk Auto-Logout"`}.
          </p>
          {hasKioskPassword ? (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                Kiosk-Passwort ist gesetzt — die <code>/kiosk</code>-Seite ist
                geschützt.
              </span>
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 flex items-center gap-2">
              <ShieldOff className="h-4 w-4 shrink-0" />
              <span>
                Kein Kiosk-Passwort gesetzt — die <code>/kiosk</code>-Seite ist
                aktuell für jeden mit der URL erreichbar.
              </span>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                {hasKioskPassword ? "Neues Passwort" : "Passwort"}
              </Label>
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Mindestens 4 Zeichen"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label>Bestätigen</Label>
              <Input
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                placeholder="Wiederholen"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {success}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            {hasKioskPassword && (
              <Button
                type="button"
                variant="ghost"
                onClick={remove}
                disabled={pending}
                className="text-destructive"
              >
                Passwort entfernen
              </Button>
            )}
            <Button type="submit" disabled={pending || !pw}>
              {pending
                ? "Speichern …"
                : hasKioskPassword
                  ? "Passwort ändern"
                  : "Passwort setzen"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
