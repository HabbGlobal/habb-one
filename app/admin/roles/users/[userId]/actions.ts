"use server";

// Tenant-SUPERADMIN-Server-Actions für Per-User-Permission-Overrides.
// Audit-Trail im normalen `AuditLog` (kein Owner-Kontext).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  invalidatePermissionMatrix,
  invalidateUserPermissionCache,
  isKnownPermission,
} from "@/lib/permissions";
import { isSuperAdmin } from "@/lib/roles";
import { recordAudit } from "@/lib/audit";

const OverrideStateSchema = z.enum(["default", "grant", "deny"]);

const saveSchema = z.object({
  userId: z.string().min(1),
  overrides: z.record(z.string(), OverrideStateSchema),
});

export type SaveUserPermissionsInput = z.input<typeof saveSchema>;

function assertSuper(role: string | null | undefined) {
  if (!isSuperAdmin(role)) {
    throw new Error("Only SUPERADMIN may change per-user permissions.");
  }
}

export async function saveUserPermissions(input: SaveUserPermissionsInput) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  assertSuper(session.user.role);

  const data = saveSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, companyId: true, role: true, email: true, deletedAt: true },
  });
  if (!user) throw new Error("User not found.");
  // Strict tenant isolation: a SUPERADMIN can only edit their own users.
// Cross-tenant access would otherwise be possible via URL manipulation.
  if (user.companyId !== session.user.companyId) {
    throw new Error("User does not belong to your tenant.");
  }
  if (user.deletedAt) throw new Error("User is deleted.");
  if (isSuperAdmin(user.role)) {
    throw new Error(
      "SUPERADMIN always has all permissions by design — per-user overrides are not permitted.",
    );
  }

  const overrideEntries: Array<{ permission: string; allowed: boolean }> = [];
  for (const [perm, state] of Object.entries(data.overrides)) {
    if (!isKnownPermission(perm)) {
      throw new Error(`Unbekannte Permission: ${perm}`);
    }
    if (state === "grant") overrideEntries.push({ permission: perm, allowed: true });
    else if (state === "deny") overrideEntries.push({ permission: perm, allowed: false });
  }

  const before = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true, allowed: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId: user.id } });
    if (overrideEntries.length > 0) {
      await tx.userPermission.createMany({
        data: overrideEntries.map((o) => ({
          companyId: user.companyId,
          userId: user.id,
          permission: o.permission,
          allowed: o.allowed,
          updatedById: session.user.id,
        })),
      });
    }
  });

  invalidatePermissionMatrix(user.companyId);
  invalidateUserPermissionCache();

  await recordAudit({
    companyId: user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "UserPermission",
    entityId: user.id,
    oldValue: { overrides: before },
    newValue: { overrides: overrideEntries },
    reason: `Per-user permissions for ${user.email} updated`,
  });

  revalidatePath(`/admin/roles/users/${user.id}`);
  revalidatePath("/admin/roles");
}

export async function resetUserPermissions(userId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  assertSuper(session.user.role);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, companyId: true, email: true },
  });
  if (!user) throw new Error("User not found.");
  if (user.companyId !== session.user.companyId) {
    throw new Error("User does not belong to your tenant.");
  }

  const before = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true, allowed: true },
  });

  await prisma.userPermission.deleteMany({ where: { userId: user.id } });

  invalidatePermissionMatrix(user.companyId);
  invalidateUserPermissionCache();

  await recordAudit({
    companyId: user.companyId,
    userId: session.user.id,
    action: "UPDATE",
    entityType: "UserPermission",
    entityId: user.id,
    oldValue: { overrides: before },
    newValue: { overrides: [], reset: true },
    reason: `Per-user permissions for ${user.email} reset`,
  });

  revalidatePath(`/admin/roles/users/${user.id}`);
  revalidatePath("/admin/roles");
}
