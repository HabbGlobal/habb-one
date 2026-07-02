"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Periodically refreshes the server component for the live dashboard. */
export function AutoRefresh({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
