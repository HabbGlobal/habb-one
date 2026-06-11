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
  SUPERADMIN: "Super-Admin",
  ADMIN: "CEO / Geschäftsleitung",
  PLANNER: "Sekretariat",
  EMPLOYEE: "Produktion",
  CUSTOMER_PORTAL: "Kundenportal",
  KIOSK_OPERATOR: "Werkstatt-Tablet",
  SECRETARY: "Sekretariat (Legacy)",
  TEAM_LEAD: "Team-Lead (Legacy)",
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
      setError("Begründung muss mindestens 10 Zeichen lang sein.");
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
                // Wenn der User soft-deleted ist, ist die einzige sinnvolle
                // Aktion die Wiederherstellung. Alles andere wäre ein Fehler.
                {
                  icon: RotateCcw,
                  label: "Wiederherstellen",
                  onClick: () => setOpenAction({ kind: "restore" }),
                },
              ]
            : [
                {
                  icon: Mail,
                  label: "Passwort-Reset-Mail senden",
                  onClick: () => setOpenAction({ kind: "reset-mail" }),
                  disabled: isSuperAdmin,
                },
                {
                  icon: KeyRound,
                  label: "Temporäres Passwort setzen",
                  onClick: () => setOpenAction({ kind: "temp-password" }),
                  disabled: isSuperAdmin,
                },
                {
                  icon: Shield,
                  label: "Rolle ändern",
                  onClick: () => setOpenAction({ kind: "role", newRole: user.role }),
                  disabled: isSuperAdmin,
                },
                isLocked
                  ? {
                      icon: Unlock,
                      label: "Entsperren",
                      onClick: () => setOpenAction({ kind: "unlock" }),
                    }
                  : {
                      icon: Lock,
                      label: "Sperren",
                      onClick: () => setOpenAction({ kind: "lock" }),
                      disabled: isSuperAdmin,
                    },
                { separator: true },
                {
                  icon: Trash2,
                  label: "Löschen (Soft-Delete)",
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
      >
        Aktionen
      </button>

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
    "reset-mail": "Passwort-Reset-Mail senden",
    "temp-password": "Temporäres Passwort setzen",
    role: "Rolle ändern",
    lock: "User sperren",
    unlock: "User entsperren",
    delete: "User löschen",
    restore: "User wiederherstellen",
  };
  const bodyMap: Record<Action["kind"], string> = {
    "reset-mail": `Der User erhält einen Magic-Link an ${user.email}. Der Link ist 60 Min gültig.`,
    "temp-password":
      "Owner sieht das Passwort EINMAL und muss es dem User persönlich übermitteln. Bestehende Sessions werden invalidiert.",
    role: "Sessions werden nach der Änderung invalidiert.",
    lock: "Der User kann sich danach nicht mehr einloggen, bis Sie ihn entsperren.",
    unlock: "Der User kann sich danach wieder einloggen.",
    delete: "Soft-Delete: nach 30 Tagen wird der Account endgültig entfernt.",
    restore:
      "Der zuvor gelöschte Account wird wieder aktiviert. Der User kann sich anschließend wieder einloggen.",
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
          <button onClick={onClose} aria-label="Abbrechen" className="text-habb-muted hover:text-habb-ink">
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
                Neue Rolle
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
                <p className="text-xs text-habb-muted">Keine Änderung — andere Rolle wählen.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium uppercase tracking-wide text-habb-muted">
              Begründung (Pflicht, ≥ 10 Zeichen)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="block w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-1"
              placeholder="z.B. User-Anfrage per Telefon — Ticket #1234"
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
            >
              Abbrechen
            </button>
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
              Bestätigen
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
          <h2 className="text-sm font-semibold text-habb-ink">Temporäres Passwort</h2>
        </header>
        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-habb-ink">
            Übermitteln Sie das Passwort jetzt direkt an{" "}
            <span className="font-medium">{email}</span>. Nach Schliessen dieses Dialogs ist es weg.
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
                {copied ? "Kopiert" : "Kopieren"}
              </button>
            </div>
          </div>
          <p className="text-xs text-habb-muted">
            Der User wird beim nächsten Login zwingend ein neues Passwort setzen müssen.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-md bg-habb-black px-4 py-2 text-sm font-medium text-white hover:bg-habb-ink"
            >
              Verstanden, schliessen
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
  if (!action) return "Aktion bestätigen";
  switch (action.kind) {
    case "reset-mail":
      return `Passwort-Reset-Mail an ${name}`;
    case "temp-password":
      return `Temporäres Passwort für ${name} setzen`;
    case "role":
      return `Rolle von ${name} ändern`;
    case "lock":
      return `${name} sperren`;
    case "unlock":
      return `${name} entsperren`;
    case "delete":
      return `${name} löschen (Soft-Delete)`;
    case "restore":
      return `${name} wiederherstellen`;
  }
}

function labelForError(code?: string): string {
  switch (code) {
    case "NOT_FOUND":
      return "User nicht gefunden.";
    case "ALREADY_LOCKED":
      return "User ist bereits gesperrt.";
    case "NOT_LOCKED":
      return "User ist nicht gesperrt.";
    case "ALREADY_DELETED":
      return "User ist bereits gelöscht.";
    case "NOT_DELETED":
      return "User ist nicht gelöscht — Wiederherstellung nicht nötig.";
    case "COMPANY_SUSPENDED":
      return "Mandant ist suspendiert — User-Wiederherstellung erst nach Reaktivieren.";
    case "NO_CHANGE":
      return "Keine Änderung — andere Rolle wählen.";
    case "SUPERADMIN_PROTECTED":
      return "Aktion gegen SUPERADMIN ist gesperrt.";
    case "INVALID":
      return "Eingabe ungültig.";
    default:
      return "Aktion fehlgeschlagen.";
  }
}

export { ROLE_LABEL };
