"use server";

// Owner server actions for the role matrix of any tenant. Mirrors
// `app/admin/roles/actions.ts`, but runs under Owner auth
// (`requireOwner({ minRole: "OWNER_ADMIN" })`) and writes to `OwnerAuditLog`
// instead of `AuditLog`.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS,
  invalidatePermissionMatrix,
  isKnownPermission,
  type Permission,
} from "@/lib/permissions";
import { CONFIGURABLE_ROLES } from "@/lib/roles";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import type { UserRole, Prisma } from "@prisma/client";

const bulkSchema = z.object({
  tenantId: z.string().min(1),
  matrix: z.record(z.enum(CONFIGURABLE_ROLES), z.array(z.string())),
});

export type SaveOwnerMatrixInput = z.input<typeof bulkSchema>;

/**
 * Owner variant: saves the complete role matrix for a specific tenant
 * (tenantId from URL params). Requires OWNER_ADMIN.
 */
export async function ownerSaveRoleMatrix(input: SaveOwnerMatrixInput) {
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) throw new Error("FORBIDDEN");
  const ctx = guard.ctx;

  const data = bulkSchema.parse(input);

  // Does the tenant exist?
  const tenant = await prisma.company.findUnique({
    where: { id: data.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error("Tenant not found.");

  // Validate permissions
  for (const role of CONFIGURABLE_ROLES) {
    const allowed = data.matrix[role] ?? [];
    for (const p of allowed) {
      if (!isKnownPermission(p)) {
        throw new Error(`Unknown permission: ${p}`);
      }
    }
  }

  // Collect the previous state for the audit log.
  const before = await prisma.rolePermission.findMany({
    where: {
      companyId: data.tenantId,
      role: { in: CONFIGURABLE_ROLES as unknown as UserRole[] },
    },
    select: { role: true, permission: true, allowed: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({
      where: {
        companyId: data.tenantId,
        role: { in: CONFIGURABLE_ROLES as unknown as UserRole[] },
      },
    });

    const rows: Array<{
      companyId: string;
      role: UserRole;
      permission: string;
      allowed: boolean;
    }> = [];

    for (const role of CONFIGURABLE_ROLES) {
      const allowedSet = new Set<Permission>(
        ((data.matrix[role] as Permission[] | undefined) ?? []).filter(
          isKnownPermission,
        ),
      );
      for (const perm of ALL_PERMISSIONS) {
        rows.push({
          companyId: data.tenantId,
          role: role as UserRole,
          permission: perm,
          allowed: allowedSet.has(perm),
        });
      }
    }

    if (rows.length > 0) {
      await tx.rolePermission.createMany({ data: rows });
    }
  });

  invalidatePermissionMatrix(data.tenantId);

  await ownerAudit({
    ownerAccountId: ctx.ownerAccountId,
    ownerEmail: ctx.ownerEmail,
    action: "TENANT_ROLE_MATRIX_UPDATED",
    targetCompanyId: data.tenantId,
    payloadBefore: { rolePermissions: before } as Prisma.InputJsonValue,
    payloadAfter: {
      matrix: Object.fromEntries(
        CONFIGURABLE_ROLES.map((r) => [r, data.matrix[r] ?? []]),
      ),
    } as Prisma.InputJsonValue,
    reason: `Role matrix for ${tenant.name} updated`,
  });

  revalidatePath(`/owner/tenants/${data.tenantId}/roles`);
}

const resetSchema = z.object({
  tenantId: z.string().min(1),
  role: z.enum(CONFIGURABLE_ROLES),
});

/** Reset a role's matrix back to the static default. */
export async function ownerResetRoleToDefaults(input: z.input<typeof resetSchema>) {
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) throw new Error("FORBIDDEN");
  const ctx = guard.ctx;

  const data = resetSchema.parse(input);

  const tenant = await prisma.company.findUnique({
    where: { id: data.tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error("Tenant not found.");

  const before = await prisma.rolePermission.findMany({
    where: { companyId: data.tenantId, role: data.role as UserRole },
    select: { permission: true, allowed: true },
  });

  await prisma.rolePermission.deleteMany({
    where: { companyId: data.tenantId, role: data.role as UserRole },
  });

  invalidatePermissionMatrix(data.tenantId);

  await ownerAudit({
    ownerAccountId: ctx.ownerAccountId,
    ownerEmail: ctx.ownerEmail,
    action: "TENANT_ROLE_MATRIX_UPDATED",
    targetCompanyId: data.tenantId,
    payloadBefore: { role: data.role, overrides: before } as Prisma.InputJsonValue,
    payloadAfter: { role: data.role, reset: true } as Prisma.InputJsonValue,
    reason: `Role ${data.role} at ${tenant.name} reset to default`,
  });

  revalidatePath(`/owner/tenants/${data.tenantId}/roles`);
}
