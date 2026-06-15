"use server";

// Server-Actions fÃ¼r die Rollen-Matrix-Verwaltung. Ausschliesslich
// SUPERADMIN-zugÃ¤nglich.

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
 * Setzt eine einzelne Override-Zeile in der Matrix.
 * Wenn der Override-Wert dem statischen Default entspricht, wird die
 * Override-Zeile gelÃ¶scht (sauber halten).
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
 * Speichert die ganze Matrix in einem Rutsch (UI klickt "Save" einmal).
 * Strategie:
 *  - Pro (role, perm) berechnen wir den gewÃ¼nschten Override-Eintrag.
 *  - Bestehende Overrides werden via deleteMany gelÃ¶scht und dann
 *    neu eingefÃ¼gt (TX).
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
    // Alle bisherigen Overrides fÃ¼r die konfigurierbaren Rollen lÃ¶schen
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
  revalidatePath("/admin", "layout"); // Sidebar evtl. Ã¤ndern
}

/**
 * Setzt die Matrix fÃ¼r eine Rolle wieder auf die statischen Defaults
 * (= alle Override-Zeilen fÃ¼r diese Rolle lÃ¶schen).
 */
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
