"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Pollt die Server-Component periodisch neu (Live-Dashboard). */
export function AutoRefresh({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
