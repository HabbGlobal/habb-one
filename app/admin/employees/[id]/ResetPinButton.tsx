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
        // Do NOT leave server action errors unhandled — otherwise
        // Next.js will only display a generic digest error page.
        // Instead, show the actual error message inline.
        setError(
          e instanceof Error && e.message
            ? e.message
            : "PIN reset failed. Please try again.",
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
