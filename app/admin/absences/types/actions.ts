"use server";

// Server actions for absence types.
//
// Authorized: anyone with `absences.write` (default: ADMIN + PLANNER)
// i.e. CEO/Management and Secretariat.
// Tenant isolation: a user may only create/edit types
// belonging to their own company.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import type { AbsenceCategory } from "@prisma/client";

const CATEGORIES = [
  "VACATION",
  "SICKNESS",
  "ACCIDENT",
  "MILITARY",
  "DOCTOR",
  "UNPAID",
  "COMPENSATION",
  "OTHER",
] as const;

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, "absences.write")) {
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

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const KEY_REGEX = /^[a-z][a-z0-9_]{1,30}$/;

const baseSchema = z.object({
  // Stable internal key — referenced in i18n and reports.
  // Only lowercase letters + underscore.
  // Cannot be changed after creation.
  key: z
    .string()
    .min(2, "Key must be at least 2 characters.")
    .max(30, "Key must be at most 30 characters.")
    .regex(KEY_REGEX, "Only lowercase letters, digits, underscore (must start with a letter)."),
  labelDe: z.string().min(1, "German label is required.").max(60),
  labelEn: z.string().min(1, "English label is required.").max(60),
  category: z.enum(CATEGORIES),
  isPaid: z.boolean(),
  reducesTarget: z.boolean(),
  countsAsWorked: z.boolean(),
  requiresApproval: z.boolean(),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be in #RRGGBB format.")
    .default("#2563eb"),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.omit({ key: true }); // key remains fixed

export type CreateAbsenceTypeInput = z.input<typeof createSchema>;
export type UpdateAbsenceTypeInput = z.input<typeof updateSchema>;

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────

export async function createAbsenceType(input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(createSchema, input);

  // key remains fixed
  const existing = await prisma.absenceType.findFirst({
    where: { companyId: user.companyId, key: data.key },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Key "${data.key}" already exists in your company.`);
  }

  const created = await prisma.absenceType.create({
    data: {
      companyId: user.companyId,
      key: data.key,
      labelDe: data.labelDe,
      labelEn: data.labelEn,
      category: data.category as AbsenceCategory,
      isPaid: data.isPaid,
      reducesTarget: data.reducesTarget,
      countsAsWorked: data.countsAsWorked,
      requiresApproval: data.requiresApproval,
      colorHex: data.colorHex,
      isActive: true,
    },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "AbsenceType",
    entityId: created.id,
    newValue: data,
  });

  revalidatePath("/admin/absences/types");
  revalidatePath("/admin/absences");
  return { id: created.id };
}

export async function updateAbsenceType(id: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(updateSchema, input);

  const before = await prisma.absenceType.findUnique({ where: { id } });
  if (!before) throw new Error("Type not found.");
  if (before.companyId !== user.companyId) {
    throw new Error("Type does not belong to your company.");
  }

  await prisma.absenceType.update({
    where: { id },
    data: {
      labelDe: data.labelDe,
      labelEn: data.labelEn,
      category: data.category as AbsenceCategory,
      isPaid: data.isPaid,
      reducesTarget: data.reducesTarget,
      countsAsWorked: data.countsAsWorked,
      requiresApproval: data.requiresApproval,
      colorHex: data.colorHex,
    },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "AbsenceType",
    entityId: id,
    oldValue: {
      labelDe: before.labelDe,
      labelEn: before.labelEn,
      category: before.category,
      isPaid: before.isPaid,
      reducesTarget: before.reducesTarget,
      countsAsWorked: before.countsAsWorked,
      requiresApproval: before.requiresApproval,
      colorHex: before.colorHex,
    },
    newValue: data,
  });

  revalidatePath("/admin/absences/types");
  revalidatePath("/admin/absences");
}

/**
 * Soft delete (archive).
 * Existing absences using this type remain untouched.
 * Only the creation of NEW absences using this type is blocked
 * (hidden from selection lists).
 */
export async function archiveAbsenceType(id: string) {
  const user = await requireWriter();

  const before = await prisma.absenceType.findUnique({ where: { id } });
  if (!before) throw new Error("Type not found.");
  if (before.companyId !== user.companyId) {
    throw new Error("Type does not belong to your company.");
  }
  if (before.archivedAt) return; // Idempotent

  await prisma.absenceType.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "AbsenceType",
    entityId: id,
    reason: "Archived",
    oldValue: { archivedAt: null, isActive: before.isActive },
    newValue: { archivedAt: new Date().toISOString(), isActive: false },
  });

  revalidatePath("/admin/absences/types");
  revalidatePath("/admin/absences");
}

export async function restoreAbsenceType(id: string) {
  const user = await requireWriter();

  const before = await prisma.absenceType.findUnique({ where: { id } });
  if (!before) throw new Error("Type not found.");
  if (before.companyId !== user.companyId) {
    throw new Error("Type does not belong to your company.");
  }
  if (!before.archivedAt) return;

  await prisma.absenceType.update({
    where: { id },
    data: { archivedAt: null, isActive: true },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "AbsenceType",
    entityId: id,
    reason: "Reactivated",
    oldValue: { archivedAt: before.archivedAt.toISOString(), isActive: false },
    newValue: { archivedAt: null, isActive: true },
  });

  revalidatePath("/admin/absences/types");
  revalidatePath("/admin/absences");
}