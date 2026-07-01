"use client";

// Tenant SUPERADMIN wrapper around the shared editor.
// Binds tenant server actions (CompanyId from session).

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
