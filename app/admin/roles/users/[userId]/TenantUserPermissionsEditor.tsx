"use client";

// Tenant-SUPERADMIN-Wrapper um den geteilten Editor.

import {
  UserPermissionsEditor,
  type OverrideState,
  type UserPermissionsEditorProps,
} from "@/components/permissions/UserPermissionsEditor";
import { saveUserPermissions, resetUserPermissions } from "./actions";
import type { Permission } from "@/lib/permissions";

interface Props
  extends Pick<
    UserPermissionsEditorProps,
    | "initialOverrides"
    | "rolePermissions"
    | "permissionDefs"
    | "userLabel"
    | "roleLabel"
  > {
  userId: string;
}

export function TenantUserPermissionsEditor({ userId, ...rest }: Props) {
  const onSave = async (overrides: Record<Permission, OverrideState>) => {
    await saveUserPermissions({ userId, overrides });
  };
  const onResetAll = async () => {
    await resetUserPermissions(userId);
  };
  return <UserPermissionsEditor {...rest} onSave={onSave} onResetAll={onResetAll} />;
}
