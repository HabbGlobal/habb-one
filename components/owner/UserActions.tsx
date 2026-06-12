"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Mail,
  KeyRound,
  Shield,
  Lock,
  Unlock,
  Trash2,
  Loader2,
  X,
  Copy,
  CheckCheck,
  RotateCcw,
} from "lucide-react";
import type { UserRole } from "@prisma/client";
import { SudoPromptModal } from "./SudoPromptModal";
import { OWNER_ASSIGNABLE_ROLES } from "@/lib/owner/users";

export interface UserActionRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lockedAt: Date | null;
  deletedAt: Date | null;
}

const ROLE_LABEL: Record<UserRole, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "CEO / Management",
  PLANNER: "Secretary",
  EMPLOYEE: "Production",
  CUSTOMER_PORTAL: "Customer Portal",
  KIOSK_OPERATOR: "Workshop Tablet",
  SECRETARY: "Secretary (Legacy)",
  TEAM_LEAD: "Team Lead (Legacy)",
};

interface Props {
  user: UserActionRow;
}

type Action =
  | { kind: "reset-mail" }
  | { kind: "temp-password" }
  | { kind: "role"; newRole: UserRole }
  | { kind: "lock" }
  | { kind: "unlock" }
  | { kind: "delete" }
  | { kind: "restore" };

export function UserActionsMenu({ user }: Props) {
  const router = useRouter();
  const [openAction, setOpenAction] = useState<Action | null>(null);
  const [tempPwd, setTempPwd] = useState<string | null>(null);
  const [showSudo, setShowSudo] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [pendingAction, setPendingAction] = useState<Action | null>(null);

  const isSuperAdmin = user.role === "SUPERADMIN";
  const isLocked = !!user.lockedAt;
  const isDeleted = !!user.deletedAt;

  const closeAll = () => {
    setOpenAction(null);
    setTempPwd(null);
    setShowSudo(false);
    setReason("");
    setError(null);
    setPendingAction(null);
  };

  const submit = (action: Action, reasonText: string) => {
    if (reasonText.trim().length < 10) {
      setError("Reason must be at least 10 characters.");
      return;
    }
    setError(null);
    setPendingAction(action);
    start(async () => {
      const res = await dispatch(user.id, action, reasonText);
      setPendingAction(null);
      if (res.status === 403) {
        const json = await res.json().catch(() => ({}));
        if (json?.error === "SUDO_REQUIRED") {
          setShowSudo(true);
          return;
        }
      }
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (action.kind === "temp-password" && data?.tempPassword) {
          setTempPwd(data.tempPassword);
          // Sudo-Reason wird hier nicht zurückgesetzt; tempPwd-Modal zeigt
          // erst noch das Passwort an.
          setOpenAction(null);
          setReason("");
          return;
        }
        closeAll();
        router.refresh();
        return;
      }
      const json = await res.json().catch(() => ({}));
      setError(json?.message || labelForError(json?.error));
    });
  };

  return (
    <>
      <ActionsDropdown
        items={
          isDeleted
            ? [
                // When user is soft-deleted, the only meaningful action is
                // restoration. Everything else would be an error.
                {
                  icon: RotateCcw,
                  label: "Restore",
                  onClick: () => setOpenAction({ kind: "restore" }),
                },
              ]
            : [
                {
                  icon: Mail,
                  label: "Send password reset email",
                  onClick: () => setOpenAction({ kind: "reset-mail" }),
                  disabled: isSuperAdmin,
                },
                {
                  icon: KeyRound,
                  label: "Set temporary password",
                  onClick: () => setOpenAction({ kind: "temp-password" }),
                  disabled: isSuperAdmin,
                },
                {
                  icon: Shield,
                  label: "Change role",
                  onClick: () => setOpenAction({ kind: "role", newRole: user.role }),
                  disabled: isSuperAdmin,
                },
                isLocked
                  ? {
                      icon: Unlock,
                      label: "Unsuspend",
                      onClick: () => setOpenAction({ kind: "unlock" }),
                    }
                  : {
                      icon: Lock,
                      label: "Suspend",
                      onClick: () => setOpenAction({ kind: "lock" }),
                      disabled: isSuperAdmin,
                    },
                { separator: true },
                {
                  icon: Trash2,
                  label: "Delete (soft delete)",
                  onClick: () => setOpenAction({ kind: "delete" }),
                  disabled: isSuperAdmin,
                  destructive: true,
                },
              ]
        }
      />

      {openAction && (
        <ActionModal
          user={user}
          action={openAction}
          reason={reason}
          setReason={setReason}
          error={error}
          pending={pending && pendingAction?.kind === openAction.kind}
          onClose={closeAll}
          onSubmit={(a, r) => submit(a, r)}
          onRoleChange={(r) =>
            setOpenAction((prev) => (prev?.kind === "role" ? { ...prev, newRole: r } : prev))
          }
        />
      )}

      {tempPwd && (
        <TempPasswordModal
          password={tempPwd}
          email={user.email}
          onClose={() => {
            setTempPwd(null);
            router.refresh();
          }}
        />
      )}

      <SudoPromptModal
        open={showSudo}
        onClose={() => setShowSudo(false)}
        onSuccess={() => {
          setShowSudo(false);
          if (openAction) submit(openAction, reason);
        }}
        actionLabel={describeAction(openAction, user.name)}
      />
    </>
  );
}

type MenuItemDef =
  | { separator: true }
  | {
      icon: typeof Mail;
      label: string;
      onClick: () => void;
      disabled?: boolean;
      destructive?: boolean;
      separator?: false;
    };

/**
 * Portal-basiertes Action-Dropdown. Liegt in document.body, daher nicht von
 * `overflow-hidden` der Tabelle abgeschnitten. Positioniert sich rechts-
 * bündig unter dem Trigger; reagiert auf Resize/Scroll und auf Outside-Click.
 */
function ActionsDropdown({ items }: { items: MenuItemDef[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Position berechnen, wenn das Menü öffnet ODER sich Viewport ändert.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const menuWidth = 240; // siehe w-60 unten
      setPos({
        top: r.bottom + window.scrollY + 6,
        left: r.right + window.scrollX - menuWidth,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Outside-Click + Escape schliessen.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (triggerRef.current?.contains(tgt)) return;
      if (menuRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
      >Actions</button>

      {open && mounted && pos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ position: "absolute", top: pos.top, left: pos.left, width: 240 }}
              className="z-50 rounded-lg border border-habb-line bg-white py-1 text-sm shadow-lg"
            >
              {items.map((it, i) =>
                "separator" in it && it.separator ? (
                  <hr key={`sep-${i}`} className="my-1 border-habb-line" />
                ) : (
                  <MenuItem
                    key={`mi-${i}-${it.label}`}
                    icon={it.icon}
                    label={it.label}
                    onClick={() => {
                      setOpen(false);
                      it.onClick();
                    }}
                    disabled={it.disabled}
                    destructive={it.destructive}
                  />
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: typeof Mail;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
        destructive ? "text-habb-red hover:bg-habb-red/5" : "text-habb-ink hover:bg-habb-paper"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ActionModal({
  user,
  action,
  reason,
  setReason,
  error,
  pending,
  onClose,
  onSubmit,
  onRoleChange,
}: {
  user: UserActionRow;
  action: Action;
  reason: string;
  setReason: (v: string) => void;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (action: Action, reason: string) => void;
  onRoleChange: (r: UserRole) => void;
}) {
  const titleMap: Record<Action["kind"], string> = {
    "reset-mail": "Send password reset email",
    "temp-password": "Set temporary password",
    role: "Change role",
    lock: "Suspend user",
    unlock: "Unsuspend user",
    delete: "Delete user",
    restore: "Restore user",
  };
  const bodyMap: Record<Action["kind"], string> = {
    "reset-mail": `The user will receive a magic link at ${user.email}. The link is valid for 60 minutes.`,
    "temp-password":
      "The owner sees the password ONCE and must convey it to the user in person. Existing sessions will be invalidated.",
    role: "Sessions will be invalidated after the change.",
    lock: "The user will not be able to log in until you unsuspend them.",
    unlock: "The user will be able to log in again.",
    delete: "Soft delete: after 30 days the account will be permanently removed.",
    restore:
      "The previously deleted account will be reactivated. The user can then log in again.",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-habb-black/30 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-habb-line px-5 py-4">
          <h2 className="text-sm font-semibold text-habb-ink">{titleMap[action.kind]}</h2>
          <button onClick={onClose} aria-label="Cancel" className="text-habb-muted hover:text-habb-ink">
            <X className="h-4 w-4" />
          </button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(action, reason);
          }}
          className="space-y-4 px-5 py-5"
          noValidate
        >
          <p className="text-sm text-habb-ink">
            <span className="font-medium">{user.name}</span>{" "}
            <span className="text-habb-muted">({user.email})</span>
          </p>
          <p className="text-sm text-habb-muted">{bodyMap[action.kind]}</p>

          {action.kind === "role" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
                New Role
              </label>
              <select
                value={action.newRole}
                onChange={(e) => onRoleChange(e.target.value as UserRole)}
                className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
              >
                {OWNER_ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {action.newRole === user.role && (
                <p className="text-xs text-habb-muted">No change — select a different role.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
              Reason (required, ≥ 10 characters)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
              placeholder="e.g. User request via phone — Ticket #1234"
            />
          </div>

          {error && (
            <p
              aria-live="polite"
              className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
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
              disabled={pending || (action.kind === "role" && action.newRole === user.role)}
              className={
                action.kind === "delete" || action.kind === "lock"
                  ? "inline-flex items-center gap-2 rounded-md bg-habb-red px-4 py-2 text-sm font-medium text-white hover:bg-habb-red-dark disabled:opacity-60"
                  : "inline-flex items-center gap-2 rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink disabled:opacity-60"
              }
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TempPasswordModal({
  password,
  email,
  onClose,
}: {
  password: string;
  email: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-habb-black/30 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-habb-line bg-white shadow-xl">
        <header className="border-b border-habb-line px-5 py-4">
          <h2 className="text-sm font-semibold text-habb-ink">Temporary password</h2>
        </header>
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-habb-ink">
            Send the password now directly to{" "}
            <span className="font-medium">{email}</span>. After closing this dialog it will be gone.
          </p>
          <div className="rounded-lg border border-habb-line bg-habb-paper px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <code className="block break-all font-mono text-base text-habb-ink">{password}</code>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
              >
                {copied ? <CheckCheck className="h-3.5 w-3.5 text-habb-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <p className="text-xs text-habb-muted">
            User will be forced to set a new password on next login.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink"
            >
              Understood, close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function dispatch(userId: string, action: Action, reason: string) {
  switch (action.kind) {
    case "reset-mail":
      return fetch(`/api/owner/users/${userId}/reset-password-mail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    case "temp-password":
      return fetch(`/api/owner/users/${userId}/temp-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    case "role":
      return fetch(`/api/owner/users/${userId}/role`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, role: action.newRole }),
      });
    case "lock":
      return fetch(`/api/owner/users/${userId}/lock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    case "unlock":
      return fetch(`/api/owner/users/${userId}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    case "delete":
      return fetch(`/api/owner/users/${userId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
    case "restore":
      return fetch(`/api/owner/users/${userId}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
  }
}

function describeAction(action: Action | null, name: string): string {
  if (!action) return "Confirm action";
  switch (action.kind) {
    case "reset-mail":
      return `Password reset email to ${name}`;
    case "temp-password":
      return `Set temporary password for ${name}`;
    case "role":
      return `Change role of ${name}`;
    case "lock":
      return `Suspend ${name}`;
    case "unlock":
      return `Unsuspend ${name}`;
    case "delete":
      return `Delete ${name} (soft delete)`;
    case "restore":
      return `Restore ${name}`;
  }
}

function labelForError(code?: string): string {
  switch (code) {
    case "NOT_FOUND":
      return "User not found.";
    case "ALREADY_LOCKED":
      return "User is already suspended.";
    case "NOT_LOCKED":
      return "User is not suspended.";
    case "ALREADY_DELETED":
      return "User is already deleted.";
    case "NOT_DELETED":
      return "User is not deleted — restoration not needed.";
    case "COMPANY_SUSPENDED":
      return "Tenant is suspended — user restoration only after reactivation.";
    case "NO_CHANGE":
      return "No change — select a different role.";
    case "SUPERADMIN_PROTECTED":
      return "Action against SUPERADMIN is blocked.";
    case "INVALID":
      return "Invalid input.";
    default:
      return "Action failed.";
  }
}

export { ROLE_LABEL };
