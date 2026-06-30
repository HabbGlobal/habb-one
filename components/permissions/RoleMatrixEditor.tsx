"use client";

// Shared matrix UI for permissions x roles.
// - Used by both the tenant SUPERADMIN (`/admin/roles`) and the owner
//   (`/owner/tenants/[id]/roles`).
// - Concrete server actions are passed as props because the owner variant sends
//   a `tenantId`, while the tenant variant gets `companyId` from the session.
// - Marks each cell when the current value differs from the static default.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, RotateCcw, Lock, Check } from "lucide-react";
import type { Permission, PermissionDefinition } from "@/lib/permissions";
import {
  CONFIGURABLE_ROLES,
  ROLE_LABELS,
  type ConfigurableRole,
} from "@/lib/roles";

export interface RoleMatrixEditorProps {
  initialMatrix: Record<ConfigurableRole, Permission[]>;
  defaults: Record<ConfigurableRole, Permission[]>;
  permissionDefs: PermissionDefinition[];
  /** Save action: accepts the complete matrix. */
  onSave: (matrix: Record<ConfigurableRole, Permission[]>) => Promise<void>;
  /** Reset action for a single role. */
  onResetRole: (role: ConfigurableRole) => Promise<void>;
  /** Optional hint text below the card header. */
  headerHint?: string;
}

type MatrixState = Record<ConfigurableRole, Set<Permission>>;

function toState(m: Record<ConfigurableRole, Permission[]>): MatrixState {
  return {
    ADMIN: new Set(m.ADMIN),
    PLANNER: new Set(m.PLANNER),
    EMPLOYEE: new Set(m.EMPLOYEE),
  };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function RoleMatrixEditor({
  initialMatrix,
  defaults,
  permissionDefs,
  onSave,
  onResetRole,
  headerHint,
}: RoleMatrixEditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const initial = useMemo(() => toState(initialMatrix), [initialMatrix]);
  const defaultsState = useMemo(() => toState(defaults), [defaults]);
  const [state, setState] = useState<MatrixState>(initial);

  const dirty = useMemo(() => {
    return CONFIGURABLE_ROLES.some((r) => !setsEqual(state[r], initial[r]));
  }, [state, initial]);

  // Group permission defs by `group`.
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    for (const def of permissionDefs) {
      if (!map.has(def.group)) map.set(def.group, []);
      map.get(def.group)!.push(def);
    }
    return Array.from(map.entries());
  }, [permissionDefs]);

  const toggle = (role: ConfigurableRole, perm: Permission) => {
    setState((prev) => {
      const next = { ...prev, [role]: new Set(prev[role]) };
      if (next[role].has(perm)) next[role].delete(perm);
      else next[role].add(perm);
      return next;
    });
    setSuccess(null);
  };

  const save = () => {
    setError(null);
    setSuccess(null);
    start(async () => {
      try {
        await onSave({
          ADMIN: Array.from(state.ADMIN),
          PLANNER: Array.from(state.PLANNER),
          EMPLOYEE: Array.from(state.EMPLOYEE),
        });
        setSuccess("Permissions matrix saved.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while saving.");
      }
    });
  };

  const resetRole = (role: ConfigurableRole) => {
    if (!confirm(`Reset role "${ROLE_LABELS[role]}" to default?`)) return;
    start(async () => {
      try {
        await onResetRole(role);
        setState((prev) => ({ ...prev, [role]: new Set(defaults[role]) }));
        setSuccess(`Role ${ROLE_LABELS[role]} reset to defaults.`);
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const discard = () => {
    setState(toState(initialMatrix));
    setError(null);
    setSuccess(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Permissions Matrix</CardTitle>
          {headerHint && (
            <p className="mt-1 text-xs text-muted-foreground">{headerHint}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={pending}>
              Discard
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || pending} size="sm">
            <Save className="h-4 w-4 mr-1" />
            {pending ? "Saving..." : "Save all"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {error && (
          <div className="mb-3 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </div>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-habb-paper border-b">
              <th className="text-left font-medium px-3 py-2 sticky left-0 bg-habb-paper min-w-[260px]">
                Function
              </th>
              <th className="font-medium px-3 py-2 min-w-[140px] bg-habb-paper">
                <div className="flex items-center justify-center gap-1">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                  <span>{ROLE_LABELS.SUPERADMIN}</span>
                </div>
                <div className="text-[10px] font-normal text-muted-foreground">
                  always all permissions
                </div>
              </th>
              {CONFIGURABLE_ROLES.map((r) => (
                <th key={r} className="font-medium px-3 py-2 min-w-[140px]">
                  <div className="flex flex-col items-center">
                    <span>{ROLE_LABELS[r]}</span>
                    <button
                      type="button"
                      onClick={() => resetRole(r)}
                      className="mt-1 text-[10px] font-normal text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      disabled={pending}
                      title="Reset to default values"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Default
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([groupName, defs]) => (
              <GroupRows
                key={groupName}
                groupName={groupName}
                defs={defs}
                state={state}
                defaults={defaultsState}
                onToggle={toggle}
                disabled={pending}
              />
            ))}
          </tbody>
        </table>

        <p className="mt-4 text-xs text-muted-foreground">
          <span className="inline-block w-3 h-3 align-middle rounded-sm bg-amber-100 border border-amber-300 mr-1"></span>
          Yellow = deviates from default.&nbsp;&nbsp;
          <strong>Tip:</strong> Server actions also check permissions
          server-side — UI always shows the current DB state.
        </p>
      </CardContent>
    </Card>
  );
}

function GroupRows({
  groupName,
  defs,
  state,
  defaults,
  onToggle,
  disabled,
}: {
  groupName: string;
  defs: PermissionDefinition[];
  state: MatrixState;
  defaults: MatrixState;
  onToggle: (role: ConfigurableRole, perm: Permission) => void;
  disabled: boolean;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={2 + CONFIGURABLE_ROLES.length}
          className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-habb-muted font-semibold border-b"
        >
          {groupName}
        </td>
      </tr>
      {defs.map((def) => (
        <tr key={def.key} className="border-b last:border-b-0 hover:bg-habb-paper">
          <td className="px-3 py-2 sticky left-0 bg-white">
            <div className="font-medium">{def.label}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{def.key}</div>
          </td>
          <td className="text-center px-3 py-2 bg-habb-paper">
            <div className="inline-flex items-center justify-center w-6 h-6 rounded bg-habb-line text-habb-red">
              <Check className="h-4 w-4" />
            </div>
          </td>
          {CONFIGURABLE_ROLES.map((role) => {
            const checked = state[role].has(def.key);
            const isDefault = defaults[role].has(def.key);
            const isOverride = checked !== isDefault;
            return (
              <td
                key={role}
                className={
                  "text-center px-3 py-2 " +
                  (isOverride ? "bg-amber-50" : "")
                }
              >
                <label className="inline-flex items-center justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-habb-line"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(role, def.key)}
                    aria-label={`${def.label} for ${ROLE_LABELS[role]}`}
                  />
                </label>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
