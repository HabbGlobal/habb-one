"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { resetEmployeePin } from "../actions";

export function ResetPinButton({ employeeId }: { employeeId: string }) {
  const t = useTranslations("employees");
  const [pending, start] = useTransition();
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm(t("resetPin") + "?")) return;
    setError(null);
    start(async () => {
      try {
        const newPin = await resetEmployeePin(employeeId);
        setPin(newPin);
      } catch (e) {
        // Server-Action-Fehler NICHT unbehandelt lassen — sonst zeigt
        // Next.js nur eine generische Digest-Fehlerseite. Stattdessen
        // die echte Meldung inline anzeigen.
        setError(
          e instanceof Error && e.message
            ? e.message
            : "PIN-Reset fehlgeschlagen. Bitte erneut versuchen.",
        );
      }
    });
  };

  if (pin) {
    return (
      <div className="text-right">
        <p className="text-sm text-muted-foreground">{t("newPinShown", { pin })}</p>
        <p className="text-2xl font-mono font-semibold tracking-widest">{pin}</p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <Button variant="outline" onClick={onClick} disabled={pending}>
        {t("resetPin")}
      </Button>
      {error && (
        <p className="mt-1 text-xs text-habb-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
