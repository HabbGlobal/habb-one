"use client";

// Einfache Client-Komponente: Klick triggert `scheduleAll`, zeigt
// Pending-Spinner + Resultat. Refresh nach Erfolg.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { scheduleAll } from "./actions";

export function ScheduleAllButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const click = () => {
    if (
      !confirm(
        "Replan all active orders (Confirmed / In Progress / On Hold)?\n\nLocked entries remain unchanged.",
      )
    ) {
      return;
    }
    setError(null);
    setFeedback(null);
    start(async () => {
      try {
        const r = await scheduleAll();
        setFeedback(
          `${r.orderCount} orders scheduled — ${r.proposedCount} steps, ${r.conflictCount} conflicts.`,
        );
        router.refresh();
        setTimeout(() => setFeedback(null), 6_000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler.");
      }
    });
  };

  return (
    <div className="flex flex-col items-end">
      <Button onClick={click} disabled={pending} size="sm">
        <Wand2 className="h-4 w-4 mr-1" />
        {pending ? "Plane …" : "Alle planen"}
      </Button>
      {feedback && (
        <span className="text-xs text-emerald-700 mt-1">{feedback}</span>
      )}
      {error && <span className="text-xs text-destructive mt-1">{error}</span>}
    </div>
  );
}
