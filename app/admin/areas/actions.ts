"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { AREA_CAPACITY_RANGE_ERROR, isValidAreaCapacityRange } from "@/lib/areas/validation";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("No permission.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `${path}: ${issue.message}` : issue.message);
  }
  return parsed.data;
}

const areaSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().or(z.literal("")),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  // Empty/0 means "no lower bound"; normalised to null.
  minEmployeesPerDay: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
    z.number().int().min(1).max(99).nullable()
  ),
  // Empty/0 means "unlimited"; we normalise to null in the action.
  maxEmployeesPerDay: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
    z.number().int().min(1).max(99).nullable()
  ),
}).refine(
  (data) => isValidAreaCapacityRange(data.minEmployeesPerDay, data.maxEmployeesPerDay),
  {
    message: AREA_CAPACITY_RANGE_ERROR,
    path: ["maxEmployeesPerDay"],
  }
);

export async function createWorkArea(input: unknown) {
  const user = await requireAdmin();
  const data = parseOrThrow(areaSchema, input);
  try {
    const a = await prisma.workArea.create({
      data: {
        companyId: user.companyId,
        name: data.name,
        description: data.description || null,
        colorHex: data.colorHex,
        sortOrder: data.sortOrder,
        minEmployeesPerDay: data.minEmployeesPerDay,
        maxEmployeesPerDay: data.maxEmployeesPerDay,
      },
    });
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "CREATE",
      entityType: "WorkArea",
      entityId: a.id,
      newValue: data,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("An area with this name already exists.");
    }
    throw err;
  }
  revalidatePath("/admin/areas");
}

export async function updateWorkArea(id: string, input: unknown) {
  const user = await requireAdmin();
  const data = parseOrThrow(areaSchema, input);
  const before = await prisma.workArea.findUniqueOrThrow({ where: { id } });
  if (before.companyId !== user.companyId) throw new Error("No permission.");
  try {
    await prisma.workArea.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        colorHex: data.colorHex,
        sortOrder: data.sortOrder,
        minEmployeesPerDay: data.minEmployeesPerDay,
        maxEmployeesPerDay: data.maxEmployeesPerDay,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("An area with this name already exists.");
    }
    throw err;
  }
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "WorkArea",
    entityId: id,
    oldValue: { name: before.name, colorHex: before.colorHex },
    newValue: data,
  });
  revalidatePath("/admin/areas");
  revalidatePath(`/admin/areas/${id}`);
}

// Bulk lifecycle actions, mirroring the rest of the admin lists.
const idsSchema = z.array(z.string().cuid()).min(1).max(500);

async function authorizeBulk(ids: string[]) {
  const user = await requireAdmin();
  const owned = await prisma.workArea.findMany({
    where: { id: { in: ids }, companyId: user.companyId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new Error("At least one entry does not belong to this company.");
  }
  return user;
}

export async function bulkArchiveAreas(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.workArea.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "WorkArea", entityId: id,
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/areas");
}

export async function bulkDeleteAreas(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.workArea.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { deletedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "WorkArea", entityId: id,
      reason: "Bulk soft-delete",
    });
  }
  revalidatePath("/admin/areas");
}

export async function bulkRestoreAreas(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.workArea.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: null, deletedAt: null },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "WorkArea", entityId: id,
      reason: "Bulk restore",
    });
  }
  revalidatePath("/admin/areas");
}

export async function bulkHardDeleteAreas(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "WorkArea", entityId: id,
      reason: "Bulk hard delete",
    });
  }
  await prisma.workArea.deleteMany({
    where: { id: { in: ids }, companyId: user.companyId },
  });
  revalidatePath("/admin/areas");
}
