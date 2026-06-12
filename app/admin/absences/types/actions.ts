"use server";

// Server-Actions für Abwesenheits-Typen.
//
// Berechtigt: jeder mit `absences.write` (Default: ADMIN + PLANNER) —
// also CEO/Geschäftsleitung und Sekretariat. Tenant-Isolation: ein
// User darf nur die Typen seiner eigenen Firma anlegen/ändern.

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

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

const KEY_REGEX = /^[a-z][a-z0-9_]{1,30}$/;

const baseSchema = z.object({
  // Stabiler interner Schlüssel — wird in i18n und Reports referenziert.
  // Nur lowercase + underscore. Nicht mehr änderbar nach Erzeugung.
  key: z
    .string()
    .min(2, "Schlüssel mindestens 2 Zeichen.")
    .max(30, "Schlüssel max. 30 Zeichen.")
    .regex(KEY_REGEX, "Nur Kleinbuchstaben, Ziffern, Unterstrich (Start mit Buchstabe)."),
  labelDe: z.string().min(1, "Label Deutsch fehlt.").max(60),
  labelEn: z.string().min(1, "Label Englisch fehlt.").max(60),
  category: z.enum(CATEGORIES),
  isPaid: z.boolean(),
  reducesTarget: z.boolean(),
  countsAsWorked: z.boolean(),
  requiresApproval: z.boolean(),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Farbe muss #RRGGBB sein.")
    .default("#2563eb"),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.omit({ key: true }); // key bleibt fix

export type CreateAbsenceTypeInput = z.input<typeof createSchema>;
export type UpdateAbsenceTypeInput = z.input<typeof updateSchema>;

// ─────────────────────────────────────────
// Actions
// ─────────────────────────────────────────

export async function createAbsenceType(input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(createSchema, input);

  // Key muss innerhalb der Firma eindeutig sein — gleicher Key bei
  // anderer Firma ist OK (multi-tenant via Composite-Unique).
  const existing = await prisma.absenceType.findFirst({
    where: { companyId: user.companyId, key: data.key },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`Schlüssel "${data.key}" existiert bereits in deiner Firma.`);
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
  if (!before) throw new Error("Typ nicht gefunden.");
  if (before.companyId !== user.companyId) {
    throw new Error("Typ gehört nicht zu deiner Firma.");
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
 * Soft-Delete (Archivierung). Bestehende Absences mit diesem Typ bleiben
 * unangetastet — nur das Anlegen NEUER Absences mit diesem Typ wird
 * blockiert (in der Liste ausgeblendet).
 */
export async function archiveAbsenceType(id: string) {
  const user = await requireWriter();

  const before = await prisma.absenceType.findUnique({ where: { id } });
  if (!before) throw new Error("Typ nicht gefunden.");
  if (before.companyId !== user.companyId) {
    throw new Error("Typ gehört nicht zu deiner Firma.");
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
  if (!before) throw new Error("Typ nicht gefunden.");
  if (before.companyId !== user.companyId) {
    throw new Error("Typ gehört nicht zu deiner Firma.");
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
    reason: "Reaktiviert",
    oldValue: { archivedAt: before.archivedAt.toISOString(), isActive: false },
    newValue: { archivedAt: null, isActive: true },
  });

  revalidatePath("/admin/absences/types");
  revalidatePath("/admin/absences");
}
