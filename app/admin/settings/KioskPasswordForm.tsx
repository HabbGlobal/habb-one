"use client";

// Manage kiosk password — protects the workshop tablet from public
// access. On the first /kiosk access this password is entered once,
// then the tablet remains unlocked. How long exactly is controlled
// by the separate "Kiosk Auto-Logout" block (default: never log out).

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
      setError("Password needs at least 4 characters.");
      return;
    }
    if (pw !== pwConfirm) {
      setError("Passwords do not match.");
      return;
    }
    start(async () => {
      try {
        await setKioskPassword({ password: pw });
        setSuccess(
          hasKioskPassword
            ? "Kiosk password changed."
            : "Kiosk password set. The tablet now needs to be unlocked once.",
        );
        setPw("");
        setPwConfirm("");
        router.refresh();
        setTimeout(() => setSuccess(null), 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while saving.");
      }
    });
  };

  const remove = () => {
    if (
      !confirm(
        "Really remove kiosk password? The tablet will then be accessible WITHOUT a password.",
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await clearKioskPassword();
        setSuccess("Kiosk password removed.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
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
            Protects the workshop tablet from unauthorized access. The secretary
            or workshop manager enters the password once during setup,
            then the tablet remains unlocked. How long exactly —
            or whether it <em>never</em> automatically logs out (default for
            workshop tablets) — is controlled by the {`"Kiosk Auto-Logout"`} block.
          </p>
          {hasKioskPassword ? (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                Kiosk password is set — the <code>/kiosk</code> page is
                protected.
              </span>
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 flex items-center gap-2">
              <ShieldOff className="h-4 w-4 shrink-0" />
              <span>
                No kiosk password set — the <code>/kiosk</code> page is
                currently accessible to anyone with the URL.
              </span>
            </div>
          )}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>
                {hasKioskPassword ? "New password" : "Password"}
              </Label>
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="At least 4 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label>Confirm</Label>
              <Input
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                placeholder="Repeat"
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
                Remove password
              </Button>
            )}
            <Button type="submit" disabled={pending || !pw}>
              {pending
                ? "Saving..."
                : hasKioskPassword
                  ? "Change password"
                  : "Set password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
