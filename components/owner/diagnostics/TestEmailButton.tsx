"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";

export function TestEmailButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const send = () =>
    start(async () => {
      setMsg(null);
      const res = await fetch("/api/owner/diagnostics/test-email", {
        method: "POST",
      });
      if (res.ok) {
        setMsg("Test email sent.");
        return;
      }
      const j = await res.json().catch(() => ({}));
      setMsg(
        j?.error === "NO_RECIPIENT"
          ? "No recipient configured (DIAGNOSTICS_EMAIL_TO/OWNER_NOTIFY_EMAIL)."
          : j?.error === "RATE_LIMITED"
            ? "Too fast — please wait 60 s."
            : "Sending failed.",
      );
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md border border-habb-line bg-white px-3.5 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        Test email
      </button>
      {msg && <span className="text-xs text-habb-muted">{msg}</span>}
    </div>
  );
}
