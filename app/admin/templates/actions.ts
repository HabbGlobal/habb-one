"use server";

// Process-Vorlagen Server Actions. Nur ADMIN.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  idsSchema,
  templateFullSchema,
} from "@/lib/validation/template";

const TX_OPTS = { maxWait: 10_000, timeout: 30_000 } as const;

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "templates.write")) {
    throw new Error("Keine Berechtigung.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `${path}: ${issue.message}` : issue.message);
  }
  return r.data;
}

// ─────────────────────────────────────────
// Create
// ─────────────────────────────────────────

export async function createTemplate(input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(templateFullSchema, input);

  let templateId = "";
  await prisma.$transaction(async (tx) => {
    const created = await tx.processTemplate.create({
      data: {
        companyId: user.companyId,
        label: data.label,
        description: data.description ?? null,
        sortOrder: data.sortOrder,
        steps: {
          create: data.steps.map((s) => ({
            sequence: s.sequence,
            processCode: s.processCode,
            machineTypeRequired: s.machineTypeRequired ?? null,
            skillRequired: s.skillRequired,
            defaultWaitMinutes: s.defaultWaitMinutes,
            notes: s.notes ?? null,
          })),
        },
      },
    });
    templateId = created.id;
  }, TX_OPTS);

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "ProcessTemplate",
    entityId: templateId,
    newValue: { label: data.label, stepCount: data.steps.length },
  });

  revalidatePath("/admin/templates");
  return { id: templateId };
}

// ─────────────────────────────────────────
// Update — Steps werden komplett neu aufgebaut
// ─────────────────────────────────────────

export async function updateTemplate(templateId: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(templateFullSchema, input);

  const before = await prisma.processTemplate.findFirstOrThrow({
    where: { id: templateId, companyId: user.companyId },
  });

  await prisma.$transaction(async (tx) => {
    await tx.processTemplateStep.deleteMany({ where: { templateId } });
    await tx.processTemplate.update({
      where: { id: templateId },
      data: {
        label: data.label,
        description: data.description ?? null,
        sortOrder: data.sortOrder,
        steps: {
          create: data.steps.map((s) => ({
            sequence: s.sequence,
            processCode: s.processCode,
            machineTypeRequired: s.machineTypeRequired ?? null,
            skillRequired: s.skillRequired,
            defaultWaitMinutes: s.defaultWaitMinutes,
            notes: s.notes ?? null,
          })),
        },
      },
    });
  }, TX_OPTS);

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "ProcessTemplate",
    entityId: templateId,
    oldValue: { label: before.label },
    newValue: { label: data.label, stepCount: data.steps.length },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  // Order-/Quote-Wizards laden Templates frisch — Änderungen wirken sofort.
  revalidatePath("/admin/orders");
  revalidatePath("/admin/quotes");
}

// ─────────────────────────────────────────
// Lifecycle (Archive / Restore / Delete)
// ─────────────────────────────────────────

export async function archiveTemplate(templateId: string) {
  const user = await requireWriter();
  const before = await prisma.processTemplate.findFirstOrThrow({
    where: { id: templateId, companyId: user.companyId },
  });
  if (before.archivedAt) throw new Error("Bereits archiviert.");
  await prisma.processTemplate.update({
    where: { id: templateId },
    data: { archivedAt: new Date() },
  });
  await recordAudit({
    companyId: user.companyId, userId: user.id,
    action: "UPDATE", entityType: "ProcessTemplate", entityId: templateId,
    reason: "Archived",
  });
  revalidatePath("/admin/templates");
}

export async function restoreTemplate(templateId: string) {
  const user = await requireWriter();
  await prisma.processTemplate.findFirstOrThrow({
    where: { id: templateId, companyId: user.companyId },
  });
  await prisma.processTemplate.update({
    where: { id: templateId },
    data: { archivedAt: null, deletedAt: null },
  });
  await recordAudit({
    companyId: user.companyId, userId: user.id,
    action: "UPDATE", entityType: "ProcessTemplate", entityId: templateId,
    reason: "Restored",
  });
  revalidatePath("/admin/templates");
}

export async function deleteTemplate(templateId: string) {
  const user = await requireWriter();
  await prisma.processTemplate.findFirstOrThrow({
    where: { id: templateId, companyId: user.companyId },
  });
  await prisma.processTemplate.update({
    where: { id: templateId },
    data: { deletedAt: new Date() },
  });
  await recordAudit({
    companyId: user.companyId, userId: user.id,
    action: "DELETE", entityType: "ProcessTemplate", entityId: templateId,
    reason: "Soft-deleted",
  });
  revalidatePath("/admin/templates");
}

// ─────────────────────────────────────────
// Bulk
// ─────────────────────────────────────────

export async function bulkArchiveTemplates(rawIds: unknown) {
  const user = await requireWriter();
  const ids = parseOrThrow(idsSchema, rawIds);
  await prisma.processTemplate.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: new Date() },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "ProcessTemplate", entityId: id,
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/templates");
}
