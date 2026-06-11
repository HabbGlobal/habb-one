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
      <div className="flex justify-center gap-3" aria-label="PIN">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-12 h-14 rounded-lg border-2 flex items-center justify-center text-3xl font-semibold bg-white"
          >
            {pin[i] ? "•" : ""}
          </div>
        ))}
      </div>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Button
            key={d}
            variant="outline"
            size="lg"
            className="h-16 text-2xl"
            onClick={() => append(d)}
            disabled={isPending}
          >
            {d}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="lg"
          className="h-16 text-base"
          onClick={clear}
          disabled={isPending}
        >
          C
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 text-2xl"
          onClick={() => append("0")}
          disabled={isPending}
        >
          0
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="h-16 text-base"
          onClick={() => setPin((p) => p.slice(0, -1))}
          disabled={isPending}
        >
          ⌫
        </Button>
      </div>
    </div>
  );
}
