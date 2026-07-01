"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function FindingActions({ findingId }: { findingId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const patch = (status: string, withReason = false) =>
    start(async () => {
      setErr(null);
      let reason: string | undefined;
      if (withReason) {
        reason =
          window.prompt("Reason (≥ 5 characters):")?.trim() || undefined;
        if (!reason || reason.length < 5) {
          setErr("Reason is required.");
          return;
        }
      }
      const res = await fetch(
        `/api/owner/diagnostics/findings/${findingId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, reason }),
        },
      );
      if (res.ok) {
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({}));
      setErr(j?.message || "Action failed.");
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-habb-muted" />}
      <button
        type="button"
        onClick={() => patch("acknowledged")}
        className="rounded-md border border-habb-line px-2 py-1 text-xs hover:bg-habb-paper"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => patch("resolved")}
        className="rounded-md border border-habb-success/40 px-2 py-1 text-xs text-habb-success hover:bg-habb-success/5"
      >
        Resolved
      </button>
      <button
        type="button"
        onClick={() => patch("ignored", true)}
        className="rounded-md border border-habb-line px-2 py-1 text-xs text-habb-muted hover:bg-habb-paper"
      >
        Ignore
      </button>
      {err && <span className="text-xs text-habb-red">{err}</span>}
    </div>
  );
}
