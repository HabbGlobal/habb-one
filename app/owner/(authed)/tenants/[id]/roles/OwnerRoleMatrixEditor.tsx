"use client";

// Owner wrapper around the shared editor — binds the tenantId
// (from URL params) to the owner server actions.

import { RoleMatrixEditor as Shared, type RoleMatrixEditorProps } from "@/components/permissions/RoleMatrixEditor";
import { ownerSaveRoleMatrix, ownerResetRoleToDefaults } from "./actions";
import type { Permission } from "@/lib/permissions";
import type { ConfigurableRole } from "@/lib/roles";

interface Props extends Pick<RoleMatrixEditorProps, "initialMatrix" | "defaults" | "permissionDefs"> {
  tenantId: string;
}

export function OwnerRoleMatrixEditor({ tenantId, ...rest }: Props) {
  const onSave = async (matrix: Record<ConfigurableRole, Permission[]>) => {
    await ownerSaveRoleMatrix({ tenantId, matrix });
  };
  const onResetRole = async (role: ConfigurableRole) => {
    await ownerResetRoleToDefaults({ tenantId, role });
  };
  return (
    <Shared
      {...rest}
      onSave={onSave}
      onResetRole={onResetRole}
      headerHint="Changes take effect immediately for all users of this tenant."
    />
  );
}
