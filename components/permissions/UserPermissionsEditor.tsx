"use client";

// Per-user permission editor (3 states per permission):
//   ⬚ "default": no override, role decides
//   ✓ "grant"  : explicitly additionally allowed (additive)
//   ✕ "deny"   : explicitly revoked (subtractive, wins over role)
//
// Used by both the tenant SUPERADMIN and the owner; the server action is passed
// as a prop so both places can use the same UI.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, RotateCcw, Check, X, Minus } from "lucide-react";
import type { Permission, PermissionDefinition } from "@/lib/permissions";

export type OverrideState = "default" | "grant" | "deny";

export interface UserPermissionsEditorProps {
  /** Mapping permission -> "grant"|"deny"; everything else counts as "default". */
  initialOverrides: Partial<Record<Permission, OverrideState>>;
  /** Effective permissions of this role (default + tenant override) for the "Default" column. */
  rolePermissions: Set<Permission>;
  permissionDefs: PermissionDefinition[];
  onSave: (overrides: Record<Permission, OverrideState>) => Promise<void>;
  onResetAll: () => Promise<void>;
  /** Display info: who this is for. */
  userLabel: string;
  roleLabel: string;
}

function normalize(
  initial: Partial<Record<Permission, OverrideState>>,
  defs: PermissionDefinition[],
): Record<Permission, OverrideState> {
  const out = {} as Record<Permission, OverrideState>;
  for (const d of defs) {
    out[d.key] = initial[d.key] ?? "default";
  }
  return out;
}

export function UserPermissionsEditor({
  initialOverrides,
  rolePermissions,
  permissionDefs,
  onSave,
  onResetAll,
  userLabel,
  roleLabel,
}: UserPermissionsEditorProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const initial = useMemo(
    () => normalize(initialOverrides, permissionDefs),
    [initialOverrides, permissionDefs],
  );
  const [state, setState] = useState<Record<Permission, OverrideState>>(initial);

  const dirty = useMemo(() => {
    for (const k of Object.keys(state) as Permission[]) {
      if (state[k] !== initial[k]) return true;
    }
    return false;
  }, [state, initial]);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    for (const d of permissionDefs) {
      if (!map.has(d.group)) map.set(d.group, []);
      map.get(d.group)!.push(d);
    }
    return Array.from(map.entries());
  }, [permissionDefs]);

  const setOverride = (perm: Permission, value: OverrideState) => {
    setState((prev) => ({ ...prev, [perm]: value }));
    setSuccess(null);
  };

  const save = () => {
    setError(null);
    setSuccess(null);
    start(async () => {
      try {
        await onSave(state);
        setSuccess("Personal permissions saved.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error while saving.");
      }
    });
  };

  const resetAll = () => {
    if (
      !confirm(
        "Remove all per-user overrides for this user? They will then only get the permissions of their role.",
      )
    )
      return;
    start(async () => {
      try {
        await onResetAll();
        setState(normalize({}, permissionDefs));
        setSuccess("All overrides removed.");
        router.refresh();
        setTimeout(() => setSuccess(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  const discard = () => {
    setState(initial);
    setError(null);
    setSuccess(null);
  };

  // Calculate the effective permission per row for the right-side display:
  // role + override.
  const effectiveOf = (perm: Permission): boolean => {
    if (state[perm] === "grant") return true;
    if (state[perm] === "deny") return false;
    return rolePermissions.has(perm);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Personal Permissions</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {userLabel} · Role: <strong>{roleLabel}</strong>. Here you can
            <strong>additionally</strong> grant permissions for this user or
            <strong>revoke</strong> them contrary to the role. Empty = role
            decides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetAll}
            disabled={pending}
            className="text-destructive"
          >
            <RotateCcw className="h-4 w-4 mr-1" /> Remove all
          </Button>
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={pending}>
              Discard
            </Button>
          )}
          <Button onClick={save} disabled={!dirty || pending} size="sm">
            <Save className="h-4 w-4 mr-1" />
            {pending ? "Saving..." : "Save"}
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
              <th className="text-left font-medium px-3 py-2 min-w-[260px]">
                Function
              </th>
              <th className="font-medium px-3 py-2 min-w-[120px] text-center">
                Role has
              </th>
              <th className="font-medium px-3 py-2 min-w-[260px] text-center">
                Personal Override
              </th>
              <th className="font-medium px-3 py-2 min-w-[120px] text-center">
                Effective
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([groupName, defs]) => (
              <UserGroupRows
                key={groupName}
                groupName={groupName}
                defs={defs}
                state={state}
                rolePermissions={rolePermissions}
                onSet={setOverride}
                disabled={pending}
                effectiveOf={effectiveOf}
              />
            ))}
          </tbody>
        </table>

        <p className="mt-4 text-xs text-muted-foreground">
          <Check className="inline h-3 w-3 text-emerald-600" /> Additionally granted
          (Grant) · <X className="inline h-3 w-3 text-destructive" /> Revoked
          (Deny, overrides the role) · <Minus className="inline h-3 w-3" />
          {" "}Default (role decides).
        </p>
      </CardContent>
    </Card>
  );
}

function UserGroupRows({
  groupName,
  defs,
  state,
  rolePermissions,
  onSet,
  disabled,
  effectiveOf,
}: {
  groupName: string;
  defs: PermissionDefinition[];
  state: Record<Permission, OverrideState>;
  rolePermissions: Set<Permission>;
  onSet: (perm: Permission, value: OverrideState) => void;
  disabled: boolean;
  effectiveOf: (perm: Permission) => boolean;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-habb-muted font-semibold border-b"
        >
          {groupName}
        </td>
      </tr>
      {defs.map((def) => {
        const cur = state[def.key];
        const role = rolePermissions.has(def.key);
        const eff = effectiveOf(def.key);
        const isOverride = cur !== "default";
        return (
          <tr
            key={def.key}
            className={`border-b last:border-b-0 hover:bg-habb-paper ${isOverride ? "bg-amber-50/40" : ""}`}
          >
            <td className="px-3 py-2">
              <div className="font-medium">{def.label}</div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {def.key}
              </div>
            </td>
            <td className="text-center px-3 py-2">
              {role ? (
                <Check className="inline h-4 w-4 text-emerald-600" />
              ) : (
                <X className="inline h-4 w-4 text-habb-muted" />
              )}
            </td>
            <td className="text-center px-3 py-2">
              <div className="inline-flex rounded-md border border-habb-line overflow-hidden">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSet(def.key, "default")}
                  className={`px-2 py-1 text-xs inline-flex items-center gap-1 ${
                    cur === "default"
                      ? "bg-habb-paper text-habb-ink"
                      : "bg-white text-habb-muted hover:bg-habb-paper"
                  }`}
                >
                  <Minus className="h-3 w-3" /> Default
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSet(def.key, "grant")}
                  className={`px-2 py-1 text-xs inline-flex items-center gap-1 border-l border-habb-line ${
                    cur === "grant"
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-white text-habb-muted hover:bg-habb-paper"
                  }`}
                >
                  <Check className="h-3 w-3" /> Grant
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSet(def.key, "deny")}
                  className={`px-2 py-1 text-xs inline-flex items-center gap-1 border-l border-habb-line ${
                    cur === "deny"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-white text-habb-muted hover:bg-habb-paper"
                  }`}
                >
                  <X className="h-3 w-3" /> Deny
                </button>
              </div>
            </td>
            <td className="text-center px-3 py-2">
              {eff ? (
                <Check className="inline h-4 w-4 text-emerald-600" />
              ) : (
                <X className="inline h-4 w-4 text-habb-muted" />
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
