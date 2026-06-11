"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "settings.write")) {
    throw new Error("Keine Berechtigung.");
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

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nameDe: z.string().min(1),
  nameEn: z.string().min(1),
  fraction: z.coerce.number().min(0).max(1).default(1),
});

export async function createHoliday(input: unknown) {
  const user = await requireAdmin();
  const data = parseOrThrow(schema, input);
  try {
    const h = await prisma.holiday.upsert({
      where: { companyId_date: { companyId: user.companyId, date: new Date(data.date) } },
      create: {
        companyId: user.companyId,
        date: new Date(data.date),
        nameDe: data.nameDe,
        nameEn: data.nameEn,
        fraction: data.fraction,
        // If a soft-deleted/archived row already exists at that date, surfacing
        // it as a new active record makes more sense than leaving the dupe.
      },
      update: {
        nameDe: data.nameDe,
        nameEn: data.nameEn,
        fraction: data.fraction,
        archivedAt: null,
        deletedAt: null,
      },
    });
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "CREATE",
      entityType: "Holiday",
      entityId: h.id,
      newValue: data,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new Error("Für dieses Datum existiert bereits ein Feiertag.");
    }
    throw err;
  }
  revalidatePath("/admin/holidays");
}

export async function updateHoliday(id: string, input: unknown) {
  const user = await requireAdmin();
  const data = parseOrThrow(schema, input);
  const before = await prisma.holiday.findUniqueOrThrow({ where: { id } });
  if (before.companyId !== user.companyId) throw new Error("Keine Berechtigung.");
  await prisma.holiday.update({
    where: { id },
    data: {
      date: new Date(data.date),
      nameDe: data.nameDe,
      nameEn: data.nameEn,
      fraction: data.fraction,
    },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Holiday",
    entityId: id,
    oldValue: { date: before.date, nameDe: before.nameDe },
    newValue: data,
  });
  revalidatePath("/admin/holidays");
  revalidatePath(`/admin/holidays/${id}`);
}

export async function deleteHoliday(id: string) {
  const user = await requireAdmin();
  const h = await prisma.holiday.findUniqueOrThrow({ where: { id } });
  if (h.companyId !== user.companyId) throw new Error("Keine Berechtigung.");
  await prisma.holiday.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "DELETE",
    entityType: "Holiday",
    entityId: id,
    oldValue: { date: h.date, nameDe: h.nameDe },
  });
  revalidatePath("/admin/holidays");
}

// ─────────────────────────────────────────
// Bulk lifecycle actions
// ─────────────────────────────────────────

const idsSchema = z.array(z.string().cuid()).min(1).max(500);

async function authorizeBulk(ids: string[]) {
  const user = await requireAdmin();
  const owned = await prisma.holiday.findMany({
    where: { id: { in: ids }, companyId: user.companyId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new Error("Mindestens ein Eintrag gehört nicht zu dieser Firma.");
  }
  return user;
}

export async function bulkArchiveHolidays(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.holiday.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "UPDATE",
      entityType: "Holiday",
      entityId: id,
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/holidays");
}

export async function bulkDeleteHolidays(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.holiday.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { deletedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "DELETE",
      entityType: "Holiday",
      entityId: id,
      reason: "Bulk soft-delete",
    });
  }
  revalidatePath("/admin/holidays");
}

export async function bulkRestoreHolidays(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.holiday.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: null, deletedAt: null },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "UPDATE",
      entityType: "Holiday",
      entityId: id,
      reason: "Bulk restore",
    });
  }
  revalidatePath("/admin/holidays");
}

export async function bulkHardDeleteHolidays(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "DELETE",
      entityType: "Holiday",
      entityId: id,
      reason: "Bulk hard delete",
    });
  }
  await prisma.holiday.deleteMany({
    where: { id: { in: ids }, companyId: user.companyId },
  });
  revalidatePath("/admin/holidays");
}
