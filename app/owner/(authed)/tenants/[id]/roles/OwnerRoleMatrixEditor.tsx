"use client";

// Owner-Wrapper um den geteilten Editor — bindet die tenantId
// (aus URL-Params) an die Owner-Server-Actions.

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
      headerHint="Änderungen wirken sofort auf alle User dieses Mandanten."
    />
  );
}
