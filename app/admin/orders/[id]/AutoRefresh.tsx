"use client";

// Lightweight auto-refresh: calls `router.refresh()` every N seconds
// to keep Server Component data (steps with live stats, status,
// history) up to date — without a full page reload.
//
// Only active when the order is in a live status (CONFIRMED,
// IN_PROGRESS, or ON_HOLD). DRAFT, COMPLETED, and CANCELLED
// states do not change automatically, so auto-refresh is disabled.

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
