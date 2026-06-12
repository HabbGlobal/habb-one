"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, KeyRound, Lock, Unlock, Loader2, X } from "lucide-react";
import { SudoPromptModal } from "./SudoPromptModal";

type OwnerRole = "OWNER_ROOT" | "OWNER_ADMIN" | "OWNER_SUPPORT";

interface OwnerRow {
  id: string;
  email: string;
  name: string;
  role: OwnerRole | string;
  isActive: boolean;
  hasPasskeys: boolean;
}

type Action =
  | { kind: "role"; newRole: OwnerRole }
  | { kind: "disable" }
  | { kind: "enable" }
  | { kind: "reset-2fa" };

/**
 * Per-row actions for Owner Team. Change role, Disable/Enable,
 * 2FA reset (forces passkey re-registration on next login).
 * All require sudo + reason.
 */
export function OwnerTeamActions({ owner }: { owner: OwnerRow }) {
  const router = useRouter();
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [showSudo, setShowSudo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setOpen(null);
    setReason("");
    setError(null);
    setShowSudo(false);
  }

  function submit(action: Action, reasonText: string) {
    if (reasonText.trim().length < 10) {
      setError("Reason must be at least 10 characters long.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await dispatch(owner.id, action, reasonText);
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
          return;
        }
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(labelError(json?.error));
        return;
      }
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <PillButton
          icon={Shield}
          onClick={() => setOpen({ kind: "role", newRole: owner.role as OwnerRole })}
        >Role</PillButton>
        {owner.isActive ? (
          <PillButton
            icon={Lock}
            destructive
            onClick={() => setOpen({ kind: "disable" })}
          >
            Deactivate
          </PillButton>
        ) : (
          <PillButton icon={Unlock} onClick={() => setOpen({ kind: "enable" })}>
            Activate
          </PillButton>
        )}
        {owner.hasPasskeys && (
          <PillButton
            icon={KeyRound}
            destructive
            onClick={() => setOpen({ kind: "reset-2fa" })}
          >
            2FA reset
          </PillButton>
        )}
      </div>

      {open && (
        <ActionModal
          owner={owner}
          action={open}
          reason={reason}
          setReason={setReason}
          error={error}
          pending={pending}
          onClose={reset}
          onSubmit={submit}
          onRoleChange={(r) =>
            setOpen((prev) => (prev?.kind === "role" ? { ...prev, newRole: r } : prev))
          }
        />
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          if (open) submit(open, reason);
        }}
        actionLabel={describe(open, owner.name)}
      />
    </>
  );
}

function PillButton({
  icon: Icon,
  onClick,
  destructive,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        destructive
          ? "inline-flex items-center gap-1 rounded-md border border-habb-red/30 bg-habb-red/5 px-2.5 py-1 text-[11px] font-medium text-habb-red-dark hover:bg-habb-red/10"
          : "inline-flex items-center gap-1 rounded-md border border-habb-line bg-white px-2.5 py-1 text-[11px] font-medium text-habb-ink hover:bg-habb-paper"
      }
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

function ActionModal({
  owner,
  action,
  reason,
  setReason,
  error,
  pending,
  onClose,
  onSubmit,
  onRoleChange,
}: {
  owner: OwnerRow;
  action: Action;
  reason: string;
  setReason: (v: string) => void;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (action: Action, reason: string) => void;
  onRoleChange: (r: OwnerRole) => void;
}) {
  const titles: Record<Action["kind"], string> = {
    role: "Change role",
    disable: "Deactivate owner",
    enable: "Activate owner",
    "reset-2fa": "Reset 2FA",
  };
  const bodies: Record<Action["kind"], string> = {
    role: "Existing sessions will be invalidated. The new role takes effect on next login.",
    disable:
      "The owner can no longer log in. Existing sessions are NOT automatically terminated — if needed, kill them separately.",
    enable: "The owner can log in again.",
    "reset-2fa":
      "All registered passkeys will be deleted. The owner must register a new passkey on next login (password + email remain unchanged).",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(action, reason);
        }}
        className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
          <h2 className="text-sm font-semibold text-habb-ink">{titles[action.kind]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-habb-muted hover:text-habb-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-habb-ink">
            <span className="font-medium">{owner.name}</span>{" "}
            <span className="text-habb-muted">({owner.email})</span>
          </p>
          <p className="text-sm text-habb-muted">{bodies[action.kind]}</p>

          {action.kind === "role" && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
                New role
              </label>
              <select
                value={action.newRole}
                onChange={(e) => onRoleChange(e.target.value as OwnerRole)}
                className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm"
              >
                <option value="OWNER_SUPPORT">Support (Read-only with consent)</option>
                <option value="OWNER_ADMIN">Admin (Manage tenants)</option>
                <option value="OWNER_ROOT">Root (Full access)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted mb-1">
              Reason (required, ≥ 10 characters)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm"
              placeholder="e.g. New team member in support — onboarding ticket #4123"
            />
          </div>

          {error && (
            <p
              aria-live="polite"
              className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red-dark"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink hover:bg-habb-paper"
            >Cancel</button>
            <button
              type="submit"
              disabled={
                pending ||
                (action.kind === "role" && action.newRole === owner.role)
              }
              className={
                action.kind === "disable" || action.kind === "reset-2fa"
                  ? "inline-flex items-center gap-2 rounded-md bg-habb-red px-4 py-2 text-sm font-medium text-white hover:bg-habb-red-dark disabled:opacity-60"
                  : "inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
              }
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function dispatch(ownerId: string, action: Action, reason: string) {
  switch (action.kind) {
    case "role":
      return fetch(`/api/owner/team/${ownerId}/role`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: action.newRole, reason }),
      });
    case "disable":
      return fetch(`/api/owner/team/${ownerId}/disable`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    case "enable":
      return fetch(`/api/owner/team/${ownerId}/enable`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    case "reset-2fa":
      return fetch(`/api/owner/team/${ownerId}/reset-2fa`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
  }
}

function describe(action: Action | null, name: string): string {
  if (!action) return "Confirm action";
  switch (action.kind) {
    case "role":
      return `Change role of ${name}`;
    case "disable":
      return `Deactivate ${name}`;
    case "enable":
      return `Activate ${name}`;
    case "reset-2fa":
      return `Reset 2FA of ${name}`;
  }
}

function labelError(code?: string): string {
  switch (code) {
    case "NOT_FOUND":
      return "Owner not found.";
    case "ROOT_PROTECTED":
      return "Action against OWNER_ROOT is blocked.";
    case "SELF_PROTECTED":
      return "Action against own account is not allowed.";
    case "NO_CHANGE":
      return "No change.";
    case "EMAIL_EXISTS":
      return "This email address already exists.";
    case "INVALID":
      return "Input invalid.";
    default:
      return "Action failed.";
  }
}
