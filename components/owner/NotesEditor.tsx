"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, FileText } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

interface NotesEditorProps {
  tenantId: string;
  initialNotes: string | null;
}

export function NotesEditor({ tenantId, initialNotes }: NotesEditorProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialNotes ?? "");
  const [pending, start] = useTransition();
  const [showSudo, setShowSudo] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initial = initialNotes ?? "";
  const dirty = value !== initial;

  const save = () => {
    setStatus("idle");
    setErrorMsg(null);
    start(async () => {
      const res = await fetch(`/api/owner/tenants/${tenantId}/notes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      if (res.ok) {
        setStatus("saved");
        router.refresh();
        setTimeout(() => setStatus("idle"), 2500);
      } else if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
        } else {
          setStatus("error");
          setErrorMsg("Not authorized.");
        }
      } else {
        setStatus("error");
        setErrorMsg("Save failed.");
      }
    });
  };

  return (
    <section className="rounded-lg border border-habb-line bg-white">
      <header className="flex items-center justify-between border-b border-habb-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-habb-ink">
          <FileText className="h-4 w-4 text-habb-muted" />
          Internal notes <span className="text-xs font-normal text-habb-muted">— visible only to Owner</span>
        </h2>
        {status === "saved" && (
          <span className="text-xs text-habb-success">Saved</span>
        )}
      </header>
      <div className="space-y-3 px-5 py-4">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Observations, onboarding status, open items, contact person … (max 8000 characters)"
          rows={8}
          maxLength={8000}
          className="block w-full resize-y rounded-lg border border-habb-line bg-white px-3.5 py-3 text-sm leading-relaxed focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2"
        />
        {errorMsg && (
          <p className="text-sm text-habb-red" aria-live="polite">
            {errorMsg}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-habb-muted">{value.length} / 8000</span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save</button>
        </div>
      </div>

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          save();
        }}
        actionLabel="Save internal notes"
      />
    </section>
  );
}
