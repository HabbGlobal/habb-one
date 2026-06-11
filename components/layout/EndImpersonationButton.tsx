"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

/**
 * Client-Button im Impersonation-Banner. Beendet die Sitzung und führt
 * den Owner zurück ins Owner-Portal des betroffenen Mandanten.
 */
export function EndImpersonationButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const res = await fetch("/api/owner/impersonation/end", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data?.redirectTo) {
        router.push(data.redirectTo);
      } else {
        router.push("/owner/tenants");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <LogOut className="h-3.5 w-3.5" />
      )}
      Sitzung beenden
    </button>
  );
}
