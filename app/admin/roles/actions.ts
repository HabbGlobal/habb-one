"use server";

// Server actions for role matrix management. Accessible only to SUPERADMIN.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS,
  invalidatePermissionMatrix,
  isKnownPermission,
  type Permission,
} from "@/lib/permissions";
import { CONFIGURABLE_ROLES, isSuperAdmin } from "@/lib/roles";
import type { UserRole } from "@prisma/client";

function assertSuperAdmin(role: UserRole | undefined | null) {
  if (!isSuperAdmin(role)) {
    throw new Error("Only SUPERADMIN may edit the permissions matrix.");
  }
}

const updateSchema = z.object({
  role: z.enum(CONFIGURABLE_ROLES),
  permission: z.string().refine(isKnownPermission, {
    message: "Unknown permission",
  }),
  allowed: z.boolean(),
});

export type UpdatePermissionInput = z.input<typeof updateSchema>;

/**
 * Sets a single override entry in the matrix.
 * If the override value matches the static default, the override row
 * is deleted (keeps data clean).
 */
export async function updateRolePermission(input: UpdatePermissionInput) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  assertSuperAdmin(session.user.role);

  const data = updateSchema.parse(input);

  await prisma.rolePermission.upsert({
    where: {
      companyId_role_permission: {
        companyId: session.user.companyId,
        role: data.role as UserRole,
        permission: data.permission,
      },
    },
    create: {
      companyId: session.user.companyId,
      role: data.role as UserRole,
      permission: data.permission,
      allowed: data.allowed,
      updatedById: session.user.id,
    },
    update: {
      allowed: data.allowed,
      updatedById: session.user.id,
    },
  });

  invalidatePermissionMatrix(session.user.companyId);
  revalidatePath("/admin/roles");
}

const bulkSchema = z.object({
  /** Map: role â†’ array of allowed permissions. */
  matrix: z.record(z.enum(CONFIGURABLE_ROLES), z.array(z.string())),
});

export type SaveMatrixInput = z.input<typeof bulkSchema>;

/**
 * Saves the entire matrix in one operation (UI triggers a single "Save").
 * Strategy:
 *  - For each (role, perm), compute the desired override entry.
 *  - Existing overrides are deleted via deleteMany and then re-inserted (transaction).
 */
export async function saveRoleMatrix(input: SaveMatrixInput) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  assertSuperAdmin(session.user.role);

  const data = bulkSchema.parse(input);

  // Validate permissions
  for (const role of CONFIGURABLE_ROLES) {
    const allowed = data.matrix[role] ?? [];
    for (const p of allowed) {
      if (!isKnownPermission(p)) {
        throw new Error(`Unknown permission: ${p}`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    // Delete all existing overrides for configurable roles.
    await tx.rolePermission.deleteMany({
      where: {
        companyId: session.user.companyId,
        role: { in: CONFIGURABLE_ROLES as unknown as UserRole[] },
      },
    });

    const rows: Array<{
      companyId: string;
      role: UserRole;
      permission: string;
      allowed: boolean;
      updatedById: string;
    }> = [];

    for (const role of CONFIGURABLE_ROLES) {
      const allowedSet = new Set<Permission>(
        ((data.matrix[role] as Permission[] | undefined) ?? []).filter(isKnownPermission),
      );
      for (const perm of ALL_PERMISSIONS) {
        rows.push({
          companyId: session.user.companyId,
          role: role as UserRole,
          permission: perm,
          allowed: allowedSet.has(perm),
          updatedById: session.user.id,
        });
      }
    }

    if (rows.length > 0) {
      await tx.rolePermission.createMany({ data: rows });
    }
  });

  invalidatePermissionMatrix(session.user.companyId);
  revalidatePath("/admin/roles");
  revalidatePath("/admin", "layout"); // Sidebar may change.
}

// Reset the matrix for a role back to static defaults
// (= delete all override rows for that role).
export async function resetRoleToDefaults(role: (typeof CONFIGURABLE_ROLES)[number]) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  assertSuperAdmin(session.user.role);

  if (!CONFIGURABLE_ROLES.includes(role)) {
    throw new Error("This role is not configurable.");
  }

  await prisma.rolePermission.deleteMany({
    where: {
      companyId: session.user.companyId,
      role: role as UserRole,
    },
  });

  invalidatePermissionMatrix(session.user.companyId);
  revalidatePath("/admin/roles");
  revalidatePath("/admin", "layout");
}
