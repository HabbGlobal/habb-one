"use client";

// Tenant-SUPERADMIN-Wrapper um den geteilten Editor. Bindet die
// Tenant-Server-Actions (CompanyId aus der Session).

import { RoleMatrixEditor as Shared, type RoleMatrixEditorProps } from "@/components/permissions/RoleMatrixEditor";
import { saveRoleMatrix, resetRoleToDefaults } from "./actions";
import type { Permission } from "@/lib/permissions";
import type { ConfigurableRole } from "@/lib/roles";

export function RoleMatrixEditor(
  props: Pick<RoleMatrixEditorProps, "initialMatrix" | "defaults" | "permissionDefs">,
) {
  const onSave = async (matrix: Record<ConfigurableRole, Permission[]>) => {
    await saveRoleMatrix({ matrix });
  };
  const onResetRole = async (role: ConfigurableRole) => {
    await resetRoleToDefaults(role);
  };
  return <Shared {...props} onSave={onSave} onResetRole={onResetRole} />;
}
