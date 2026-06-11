"use server";

// Server-Actions für die Rollen-Matrix-Verwaltung. Ausschliesslich
// SUPERADMIN-zugänglich.

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
    throw new Error("Nur SUPERADMIN darf die Rechte-Matrix ändern.");
  }
}

const updateSchema = z.object({
  role: z.enum(CONFIGURABLE_ROLES),
  permission: z.string().refine(isKnownPermission, {
    message: "Unbekannte Permission",
  }),
  allowed: z.boolean(),
});

export type UpdatePermissionInput = z.input<typeof updateSchema>;

/**
 * Setzt eine einzelne Override-Zeile in der Matrix.
 * Wenn der Override-Wert dem statischen Default entspricht, wird die
 * Override-Zeile gelöscht (sauber halten).
 */
export async function updateRolePermission(input: UpdatePermissionInput) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
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
  /** Map: role → array of allowed permissions. */
  matrix: z.record(z.enum(CONFIGURABLE_ROLES), z.array(z.string())),
});

export type SaveMatrixInput = z.input<typeof bulkSchema>;

/**
 * Speichert die ganze Matrix in einem Rutsch (UI klickt "Speichern" einmal).
 * Strategie:
 *  - Pro (role, perm) berechnen wir den gewünschten Override-Eintrag.
 *  - Bestehende Overrides werden via deleteMany gelöscht und dann
 *    neu eingefügt (TX).
 */
export async function saveRoleMatrix(input: SaveMatrixInput) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  assertSuperAdmin(session.user.role);

  const data = bulkSchema.parse(input);

  // Validate permissions
  for (const role of CONFIGURABLE_ROLES) {
    const allowed = data.matrix[role] ?? [];
    for (const p of allowed) {
      if (!isKnownPermission(p)) {
        throw new Error(`Unbekannte Permission: ${p}`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    // Alle bisherigen Overrides für die konfigurierbaren Rollen löschen
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
  revalidatePath("/admin", "layout"); // Sidebar evtl. ändern
}

/**
 * Setzt die Matrix für eine Rolle wieder auf die statischen Defaults
 * (= alle Override-Zeilen für diese Rolle löschen).
 */
export async function resetRoleToDefaults(role: (typeof CONFIGURABLE_ROLES)[number]) {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  assertSuperAdmin(session.user.role);

  if (!CONFIGURABLE_ROLES.includes(role)) {
    throw new Error("Diese Rolle ist nicht konfigurierbar.");
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
