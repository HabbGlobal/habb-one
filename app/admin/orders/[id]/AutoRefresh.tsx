"use client";

// Lightweight auto-refresh: ruft `router.refresh()` alle N Sekunden,
// damit die Server-Component-Daten (Schritte mit live-Stats, Status,
// History) aktuell bleiben — ohne Page-Reload.
//
// Nur dann aktiv, wenn der Auftrag in einem Live-Status ist (CONFIRMED /
// IN_PROGRESS / ON_HOLD) — DRAFT/COMPLETED/CANCELLED ändert sich nicht
// von alleine.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 5_000;

export function AutoRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const handle = setInterval(() => {
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(handle);
  }, [enabled, router]);
  return null;
}
