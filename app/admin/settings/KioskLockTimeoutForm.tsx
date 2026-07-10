"use client";

// Kiosk lock timeout — how long does the tablet remain unlocked after
// entering the password before requiring the password screen again?
// Default `0` (never auto-logout) is suitable for workshop tablets
// that are permanently mounted in the shop.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Infinity as InfinityIcon } from "lucide-react";
import { setKioskLockTimeout } from "./actions";

interface Props {
  currentMinutes: number;
}

type Mode = "never" | "shift" | "custom";

const SHIFT_MINUTES = 12 * 60;

function deriveMode(minutes: number): Mode {
  if (minutes === 0) return "never";
  if (minutes === SHIFT_MINUTES) return "shift";
  return "custom";
}

export function KioskLockTimeoutForm({ currentMinutes }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>(deriveMode(currentMinutes));
  const [customMinutes, setCustomMinutes] = useState<string>(
    currentMinutes > 0 && currentMinutes !== SHIFT_MINUTES
      ? String(currentMinutes)
      : "60",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    let minutes: number;
    if (mode === "never") {
      minutes = 0;
    } else if (mode === "shift") {
      minutes = SHIFT_MINUTES;
    } else {
      const n = Number.parseInt(customMinutes, 10);
      if (!Number.isFinite(n) || n < 1 || n > 10080) {
        setError("Minutes must be between 1 and 10080 (7 days).");
        return;
      }
      minutes = n;
    }

    start(async () => {
      try {
        await setKioskLockTimeout({ minutes });
        setSuccess(
          minutes === 0
            ? "Auto-logout deactivated — the tablet remains permanently logged in."
            : `Auto-logout active: ${minutes} minutes after last action.`,
        );
        router.refresh();
        setTimeout(() => setSuccess(null), 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while saving.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Kiosk Auto-Logout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          <p>
            How long does the workshop tablet remain unlocked after entering the
            password before requiring the kiosk password again?
            Each successful clock action extends the time again
            (sliding window).
          </p>
          <p className="mt-2">
            Default for Habb One: <strong>Never auto-logout</strong>
            {" "}— suitable when the tablet is permanently mounted in the workshop and
            is physically protected anyway.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Auto-logout mode</legend>

            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name="mode"
                checked={mode === "never"}
                onChange={() => setMode("never")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium flex items-center gap-2">
                  <InfinityIcon className="h-4 w-4" />
                  Never auto-logout
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Tablet remains permanently bound to the tenant
                  until the end-of-shift logout button on the tablet is pressed.
                  Recommended for permanently mounted workshop tablets.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name="mode"
                checked={mode === "shift"}
                onChange={() => setMode("shift")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">After one shift (12 hours)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  After 12 hours without a clock action the tablet
                  falls back to the password screen.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
              <input
                type="radio"
                name="mode"
                checked={mode === "custom"}
                onChange={() => setMode("custom")}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">Custom (in minutes)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Any duration, 1–10080 minutes (max. 7 days).
                </div>
                {mode === "custom" && (
                  <div className="mt-2 flex items-center gap-2">
                    <Label htmlFor="kiosk-timeout-custom" className="text-xs">
                      Minutes:
                    </Label>
                    <Input
                      id="kiosk-timeout-custom"
                      type="number"
                      min={1}
                      max={10080}
                      step={1}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            </label>
          </fieldset>

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

          <div className="flex justify-end pt-2 border-t">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
