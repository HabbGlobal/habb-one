"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, X, Copy, CheckCheck } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

type OwnerRole = "OWNER_SUPPORT" | "OWNER_ADMIN" | "OWNER_ROOT";

/**
 * Create-owner modal. Owner root enters email, name, and role. The server
 * generates an initial password in a show-once modal, which is passed to the
 * new owner through a secure channel. Passkey enrollment happens on first login.
 */
export function CreateOwnerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showSudo, setShowSudo] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdPwd, setCreatedPwd] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setOpen(false);
    setError(null);
    setCreatedPwd(null);
    setShowSudo(false);
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    const payload = {
      email: String(fd.get("email") ?? "").trim(),
      name: String(fd.get("name") ?? "").trim(),
      role: (fd.get("role") as OwnerRole) ?? "OWNER_SUPPORT",
      reason: String(fd.get("reason") ?? "").trim(),
    };
    if (!payload.email || !payload.name) {
      setError("Email and name are required.");
      return;
    }
    if (payload.reason.length < 10) {
      setError("Reason must be at least 10 characters long.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await fetch("/api/owner/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
          return;
        }
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(
          json?.error === "EMAIL_EXISTS"
            ? "This email address already exists."
            : json?.message || "Creation failed.",
        );
        return;
      }
      const data = await res.json();
      setCreatedPwd({ email: payload.email, password: data.initialPassword });
      router.refresh();
    });
  }

  async function copyPwd() {
    if (!createdPwd) return;
    await navigator.clipboard.writeText(createdPwd.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-habb-black px-3 py-2 text-xs font-medium text-white hover:bg-habb-ink"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Create owner
      </button>

      {open && !createdPwd && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
          onClick={(e) => e.target === e.currentTarget && reset()}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget);
            }}
            className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl"
          >
            <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
              <h2 className="text-sm font-semibold text-habb-ink">Create new owner</h2>
              <button
                type="button"
                onClick={reset}
                aria-label="Close"
                className="text-habb-muted hover:text-habb-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-4 px-5 py-5">
              <Field label="Email" name="email" type="email" required />
              <Field label="Name" name="name" required />
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">Role</label>
                <select
                  name="role"
                  defaultValue="OWNER_SUPPORT"
                  className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm"
                >
                  <option value="OWNER_SUPPORT">Support (Read-only with consent)</option>
                  <option value="OWNER_ADMIN">Admin (Manage tenants)</option>
                  <option value="OWNER_ROOT">Root (Full access)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
                  Reason (required, ≥ 10 characters)
                </label>
                <textarea
                  name="reason"
                  rows={3}
                  className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm"
                  placeholder="e.g. New support team member — onboarding ticket #4123"
                />
              </div>

              {error && (
                <p className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red-dark">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
                >
                  {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {createdPwd && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-habb-black/30 px-4"
          onClick={(e) => e.target === e.currentTarget && reset()}
        >
          <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
            <header className="border-b border-habb-line px-5 py-4">
              <h2 className="text-sm font-semibold text-habb-ink">
                Initial password
              </h2>
            </header>
            <div className="space-y-4 px-5 py-5">
              <p className="text-sm text-habb-ink">
                Transmit the password directly to{" "}
                <span className="font-medium">{createdPwd.email}</span>. After
                closing it is gone — nobody (not even OWNER_ROOT) can view it
                later.
              </p>
              <div className="rounded-lg border border-habb-line bg-habb-paper px-4 py-3 flex items-center justify-between gap-3">
                <code className="font-mono text-base text-habb-ink break-all">
                  {createdPwd.password}
                </code>
                <button
                  type="button"
                  onClick={copyPwd}
                  className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
                >
                  {copied ? (
                    <CheckCheck className="h-3.5 w-3.5 text-habb-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-habb-muted">
                The new owner will be required to register a passkey on first
                login. Password + passkey are mandatory factors.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink"
                >
                  Understood, close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => setShowSudo(false)}
        actionLabel="Create new owner account"
      />
    </>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
      />
    </div>
  );
}
