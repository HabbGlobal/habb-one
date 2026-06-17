"use server";

// Owner server actions for per-user permission overrides.
// Writes to UserPermission; audit trail goes to OwnerAuditLog.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS,
  invalidatePermissionMatrix,
  invalidateUserPermissionCache,
  isKnownPermission,
} from "@/lib/permissions";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { isSuperAdmin } from "@/lib/roles";
import type { Prisma } from "@prisma/client";

const OverrideStateSchema = z.enum(["default", "grant", "deny"]);

const saveSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  overrides: z.record(z.string(), OverrideStateSchema),
});

export type SaveOwnerUserPermissionsInput = z.input<typeof saveSchema>;

/**
 * Set per-user permission overrides for a user. The target state is passed per
 * permission: "default" (no row), "grant" (allowed=true), or "deny"
 * (allowed=false).
 */
export async function ownerSaveUserPermissions(input: SaveOwnerUserPermissionsInput) {
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) throw new Error("FORBIDDEN");
  const ctx = guard.ctx;

  const data = saveSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, companyId: true, role: true, email: true, name: true, deletedAt: true },
  });
  if (!user) throw new Error("User not found.");
  if (user.companyId !== data.tenantId) {
    throw new Error("User does not belong to this tenant.");
  }
  if (user.deletedAt) {
    throw new Error("User is deleted.");
  }
  // SUPERADMIN always keeps all permissions by definition. Overrides are
  // ignored (see lib/permissions.ts), so explicitly forbid them here to avoid
  // suggesting that they would take effect.
  if (isSuperAdmin(user.role)) {
    throw new Error(
      "SUPERADMIN always has all permissions by design. Per-user overrides are not allowed here.",
    );
  }

  // Validate permissions
  const overrideEntries: Array<{ permission: string; allowed: boolean }> = [];
  for (const [perm, state] of Object.entries(data.overrides)) {
    if (!isKnownPermission(perm)) {
      throw new Error(`Unknown permission: ${perm}`);
    }
    if (state === "grant") overrideEntries.push({ permission: perm, allowed: true });
    else if (state === "deny") overrideEntries.push({ permission: perm, allowed: false });
    // "default" means no row; old rows are removed if present.
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
          updatedByOwnerAccountId: ctx.ownerAccountId,
        })),
      });
    }
  });

  // Invalidate caches: the tenant matrix remains, but the per-user cache in
  // the same process must be reloaded or the next same-process request sees
  // stale values.
  invalidatePermissionMatrix(user.companyId);
  invalidateUserPermissionCache();

  await ownerAudit({
    ownerAccountId: ctx.ownerAccountId,
    ownerEmail: ctx.ownerEmail,
    action: "USER_PERMISSIONS_UPDATED",
    targetCompanyId: user.companyId,
    targetUserId: user.id,
    payloadBefore: { overrides: before } as Prisma.InputJsonValue,
    payloadAfter: { overrides: overrideEntries } as Prisma.InputJsonValue,
    reason: `Per-user permissions for ${user.email} updated`,
  });

  revalidatePath(`/owner/tenants/${data.tenantId}/users/${data.userId}/permissions`);
  revalidatePath(`/owner/tenants/${data.tenantId}/users`);
}

const resetSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
});

/** Delete all per-user overrides for a user; no row means the role decides. */
export async function ownerResetUserPermissions(input: z.input<typeof resetSchema>) {
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) throw new Error("FORBIDDEN");
  const ctx = guard.ctx;

  const data = resetSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, companyId: true, email: true },
  });
  if (!user) throw new Error("User not found.");
  if (user.companyId !== data.tenantId) {
    throw new Error("User does not belong to this tenant.");
  }

  const before = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true, allowed: true },
  });

  await prisma.userPermission.deleteMany({ where: { userId: user.id } });

  invalidatePermissionMatrix(user.companyId);
  invalidateUserPermissionCache();

  await ownerAudit({
    ownerAccountId: ctx.ownerAccountId,
    ownerEmail: ctx.ownerEmail,
    action: "USER_PERMISSIONS_UPDATED",
    targetCompanyId: user.companyId,
    targetUserId: user.id,
    payloadBefore: { overrides: before } as Prisma.InputJsonValue,
    payloadAfter: { overrides: [], reset: true } as Prisma.InputJsonValue,
    reason: `Per-user permissions for ${user.email} reset`,
  });

  revalidatePath(`/owner/tenants/${data.tenantId}/users/${data.userId}/permissions`);
}

// `ALL_PERMISSIONS` is referenced here so TS keeps compiling when new
// permissions are imported; it is not currently needed at runtime.
void ALL_PERMISSIONS;
