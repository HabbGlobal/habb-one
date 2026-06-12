"use server";

// Owner-Server-Actions für Per-User-Permission-Overrides.
// Schreibt in UserPermission; Audit-Trail in OwnerAuditLog.

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
 * Setzt die Per-User-Permission-Overrides für einen User. Übergeben wird
 * pro Permission der Zielzustand: "default" (kein Eintrag), "grant"
 * (allowed=true) oder "deny" (allowed=false).
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
  if (!user) throw new Error("User nicht gefunden.");
  if (user.companyId !== data.tenantId) {
    throw new Error("User gehört nicht zu diesem Tenanten.");
  }
  if (user.deletedAt) {
    throw new Error("User ist gelöscht.");
  }
  // SUPERADMIN behält per Definition immer alle Rechte — Overrides
  // werden ignoriert (siehe lib/permissions.ts), daher verbieten wir
  // sie hier explizit, damit der User nicht denkt, sie würden greifen.
  if (isSuperAdmin(user.role)) {
    throw new Error(
      "SUPERADMIN hat per Design immer alle Rechte — Per-User-Overrides sind hier nicht zulässig.",
    );
  }

  // Validate permissions
  const overrideEntries: Array<{ permission: string; allowed: boolean }> = [];
  for (const [perm, state] of Object.entries(data.overrides)) {
    if (!isKnownPermission(perm)) {
      throw new Error(`Unbekannte Permission: ${perm}`);
    }
    if (state === "grant") overrideEntries.push({ permission: perm, allowed: true });
    else if (state === "deny") overrideEntries.push({ permission: perm, allowed: false });
    // "default" → kein Eintrag (alte ggf. löschen)
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

  // Caches invalidieren: Tenant-Matrix bleibt, aber der Per-User-Cache
  // im selben Process muss frisch geladen werden — sonst sieht der nächste
  // Same-Process-Request alte Werte.
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
    reason: `Per-User-Rechte für ${user.email} aktualisiert`,
  });

  revalidatePath(`/owner/tenants/${data.tenantId}/users/${data.userId}/permissions`);
  revalidatePath(`/owner/tenants/${data.tenantId}/users`);
}

const resetSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
});

/** Löscht alle Per-User-Overrides eines Users (kein Eintrag → Role entscheidet). */
export async function ownerResetUserPermissions(input: z.input<typeof resetSchema>) {
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) throw new Error("FORBIDDEN");
  const ctx = guard.ctx;

  const data = resetSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, companyId: true, email: true },
  });
  if (!user) throw new Error("User nicht gefunden.");
  if (user.companyId !== data.tenantId) {
    throw new Error("User gehört nicht zu diesem Tenanten.");
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
    reason: `Per-User-Rechte für ${user.email} zurückgesetzt`,
  });

  revalidatePath(`/owner/tenants/${data.tenantId}/users/${data.userId}/permissions`);
}

// `ALL_PERMISSIONS` hier nur referenziert, damit TS auf einen Import
// neuer Permissions hin compilen lässt; aktuell brauchen wir es nicht
// runtime-mässig.
void ALL_PERMISSIONS;
