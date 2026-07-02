"use client";

// Owner wrapper around the shared user editor.

import {
  UserPermissionsEditor,
  type OverrideState,
  type UserPermissionsEditorProps,
} from "@/components/permissions/UserPermissionsEditor";
import { ownerSaveUserPermissions, ownerResetUserPermissions } from "./actions";
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
  tenantId: string;
  userId: string;
}

export function OwnerUserPermissionsEditor({
  tenantId,
  userId,
  ...rest
}: Props) {
  const onSave = async (overrides: Record<Permission, OverrideState>) => {
    await ownerSaveUserPermissions({ tenantId, userId, overrides });
  };
  const onResetAll = async () => {
    await ownerResetUserPermissions({ tenantId, userId });
  };
  return <UserPermissionsEditor {...rest} onSave={onSave} onResetAll={onResetAll} />;
}
