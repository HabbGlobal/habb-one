"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "absences.write")) {
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

const absenceSchema = z.object({
  employeeId: z.string().cuid(),
  absenceTypeId: z.string().cuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startHalfDay: z.boolean().default(false),
  endHalfDay: z.boolean().default(false),
  reason: z.string().optional().nullable(),
  status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "CANCELLED"]).default("APPROVED"),
});

export async function createAbsence(input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(absenceSchema, input);
  if (data.endDate < data.startDate) throw new Error("Enddatum vor Startdatum.");

  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: data.employeeId } });
  if (employee.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  const absence = await prisma.absence.create({
    data: {
      employeeId: data.employeeId,
      absenceTypeId: data.absenceTypeId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      startHalfDay: data.startHalfDay,
      endHalfDay: data.endHalfDay,
      reason: data.reason || null,
      status: data.status,
      decidedById: data.status !== "REQUESTED" ? user.id : null,
      decidedAt: data.status !== "REQUESTED" ? new Date() : null,
    },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: data.employeeId,
    action: "CREATE",
    entityType: "Absence",
    entityId: absence.id,
    newValue: data,
  });
  revalidatePath("/admin/absences");
}

export async function updateAbsence(id: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(absenceSchema, input);
  if (data.endDate < data.startDate) throw new Error("Enddatum vor Startdatum.");

  const before = await prisma.absence.findUniqueOrThrow({
    where: { id },
    include: { employee: true },
  });
  if (before.employee.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  await prisma.absence.update({
    where: { id },
    data: {
      employeeId: data.employeeId,
      absenceTypeId: data.absenceTypeId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      startHalfDay: data.startHalfDay,
      endHalfDay: data.endHalfDay,
      reason: data.reason || null,
      status: data.status,
      decidedById: data.status !== "REQUESTED" ? user.id : null,
      decidedAt: data.status !== "REQUESTED" ? new Date() : null,
    },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: data.employeeId,
    action: "UPDATE",
    entityType: "Absence",
    entityId: id,
    oldValue: { startDate: before.startDate, status: before.status },
    newValue: data,
  });
  revalidatePath("/admin/absences");
  revalidatePath(`/admin/absences/${id}`);
}

export async function decideAbsence(id: string, status: "APPROVED" | "REJECTED" | "CANCELLED") {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "absences.approve")) {
    throw new Error("Keine Berechtigung.");
  }
  const before = await prisma.absence.findUniqueOrThrow({
    where: { id },
    include: { employee: true },
  });
  if (before.employee.companyId !== session.user.companyId) throw new Error("Keine Berechtigung.");
  await prisma.absence.update({
    where: { id },
    data: { status, decidedById: session.user.id, decidedAt: new Date() },
  });
  await recordAudit({
    companyId: session.user.companyId,
    userId: session.user.id,
    employeeId: before.employeeId,
    action: "UPDATE",
    entityType: "Absence",
    entityId: id,
    oldValue: { status: before.status },
    newValue: { status },
  });
  revalidatePath("/admin/absences");
}

// ─────────────────────────────────────────
// Bulk lifecycle actions
// ─────────────────────────────────────────

const idsSchema = z.array(z.string().cuid()).min(1).max(500);

async function authorizeBulk(ids: string[]) {
  const user = await requireWriter();
  const owned = await prisma.absence.findMany({
    where: {
      id: { in: ids },
      employee: { companyId: user.companyId },
    },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new Error("Mindestens ein Eintrag gehört nicht zu dieser Firma.");
  }
  return user;
}

export async function bulkArchiveAbsences(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.absence.updateMany({
    where: { id: { in: ids } },
    data: { archivedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "UPDATE",
      entityType: "Absence",
      entityId: id,
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/absences");
}

export async function bulkDeleteAbsences(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.absence.updateMany({
    where: { id: { in: ids } },
    data: { deletedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "DELETE",
      entityType: "Absence",
      entityId: id,
      reason: "Bulk soft-delete",
    });
  }
  revalidatePath("/admin/absences");
}

export async function bulkRestoreAbsences(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.absence.updateMany({
    where: { id: { in: ids } },
    data: { archivedAt: null, deletedAt: null },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "UPDATE",
      entityType: "Absence",
      entityId: id,
      reason: "Bulk restore",
    });
  }
  revalidatePath("/admin/absences");
}

export async function bulkHardDeleteAbsences(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      action: "DELETE",
      entityType: "Absence",
      entityId: id,
      reason: "Bulk hard delete (purge)",
    });
  }
  await prisma.absence.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/admin/absences");
}
