"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Periodically calls router.refresh() so a server-rendered page stays
 *  in sync with the database without a full reload. */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
