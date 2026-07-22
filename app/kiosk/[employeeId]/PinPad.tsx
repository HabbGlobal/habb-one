"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  employeeId: string;
  wrongPinMessage: string;
  lockedMessage: string;
}

export function PinPad({ employeeId, wrongPinMessage, lockedMessage }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const router = useRouter();

  const append = (digit: string) => {
    if (pin.length >= 4) return;
    setError(null);
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      submit(next);
    }
  };

  const clear = () => {
    setPin("");
    setError(null);
  };

  const submit = (full: string) => {
    start(async () => {
      const res = await fetch("/api/kiosk/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, pin: full }),
      });
      if (res.ok) {
        router.push(`/kiosk/${employeeId}/actions`);
      } else if (res.status === 423) {
        setError(lockedMessage);
        setPin("");
      } else {
        setError(wrongPinMessage);
        setPin("");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center gap-6 min-h-[28px]" aria-label="PIN">
        {isPending ? (
          <div className="flex w-full items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-habb-red border-t-transparent shadow-[0_0_20px_rgba(218,14,21,0.5)]" />
          </div>
        ) : (
          [0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-7 h-7 rounded-full transition-all duration-300 ${
                pin[i]
                  ? "bg-habb-red shadow-[0_0_20px_rgba(218,14,21,0.8)] scale-110"
                  : "bg-habb-paper border border-habb-line dark:bg-white/10 dark:border-0"
              }`}
            />
          ))
        )}
      </div>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button
            key={d}
            variant="ghost"
            size="lg"
            className="h-20 text-3xl rounded-full bg-habb-paper hover:bg-habb-line/60 hover:scale-105 active:scale-95 text-habb-ink border border-habb-line transition-all dark:bg-white/5 dark:hover:bg-white/10 dark:hover:text-white dark:text-white dark:border-white/5"
            onClick={() => append(d)}
            disabled={isPending}
          >
            {d}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="lg"
          className="h-20 text-lg rounded-full text-habb-muted hover:bg-habb-line/60 hover:text-habb-ink transition-all dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={clear}
          disabled={isPending}
        >
          C
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="h-20 text-3xl rounded-full bg-habb-paper hover:bg-habb-line/60 hover:scale-105 active:scale-95 text-habb-ink border border-habb-line transition-all dark:bg-white/5 dark:hover:bg-white/10 dark:hover:text-white dark:text-white dark:border-white/5"
          onClick={() => append("0")}
          disabled={isPending}
        >
          0
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="h-20 text-lg rounded-full text-habb-muted hover:bg-habb-line/60 hover:text-habb-ink transition-all dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={() => setPin((p) => p.slice(0, -1))}
          disabled={isPending}
        >
          ⌫
        </Button>
      </div>
    </div>
  );
}
