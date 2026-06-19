"use server";

// Server actions for machine management.
// Pattern same as Customers/Employees:
//   1. Permission check (`machines.read|write`)
//   2. Zod validation
//   3. Transaction for multi-row changes
//   4. Audit log

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

// Default workshop weekly schedule (Mon–Fri 07:30–12:00 / 13:00–17:00, Sat+Sun empty).
const DEFAULT_WORKING_HOURS = {
  mon: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  tue: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  wed: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  thu: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
  fri: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "16:00" }],
  sat: [],
  sun: [],
} as const;

const machineCoreSchema = z.object({
  name: z.string().min(1, "Name required").max(80),
  type: z.enum([
    "BLAST_CABIN",
    "CHEM_BATH",
    "PAINT_CABIN",
    "POWDER_CABIN",
    "CURING_OVEN",
    "DRYING_OVEN",
  ]),
  workAreaId: z.string().cuid().optional().nullable(),
  maxLengthMm: z.coerce.number().int().min(0).optional().nullable(),
  maxWidthMm: z.coerce.number().int().min(0).optional().nullable(),
  maxHeightMm: z.coerce.number().int().min(0).optional().nullable(),
  maxWeightKg: z.coerce.number().int().min(0).optional().nullable(),
  chargeCapacityM2: z.coerce.number().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type MachineCoreInput = z.input<typeof machineCoreSchema>;

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, "machines.write")) {
    throw new Error("No permission to edit machines.");
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

/** Verify WorkArea ownership — protects against cross-tenant access. */
async function assertAreaInCompany(
  areaId: string | null | undefined,
  companyId: string,
) {
  if (!areaId) return;
  const area = await prisma.workArea.findFirst({
    where: { id: areaId, companyId },
    select: { id: true },
  });
  if (!area) throw new Error("Area does not belong to this company.");
}

export async function createMachine(input: unknown) {
  const data = parseOrThrow(machineCoreSchema, input);
  const user = await requireWriter();

  // Per-company name uniqueness check (schema has a global unique constraint,
  // but we want to catch collisions early with a clear message).
  const dup = await prisma.machine.findFirst({
    where: { companyId: user.companyId, name: data.name, deletedAt: null },
    select: { id: true },
  });
  if (dup) throw new Error(`A machine with name "${data.name}" already exists.`);

  await assertAreaInCompany(data.workAreaId, user.companyId);

  const machine = await prisma.machine.create({
    data: {
      companyId: user.companyId,
      name: data.name,
      type: data.type,
      workAreaId: data.workAreaId || null,
      maxLengthMm: data.maxLengthMm ?? null,
      maxWidthMm: data.maxWidthMm ?? null,
      maxHeightMm: data.maxHeightMm ?? null,
      maxWeightKg: data.maxWeightKg ?? null,
      chargeCapacityM2: data.chargeCapacityM2 ?? null,
      isActive: data.isActive,
      workingHours: DEFAULT_WORKING_HOURS,
    },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Machine",
    entityId: machine.id,
    newValue: { name: machine.name, type: machine.type },
  });

  revalidatePath("/admin/machines");
  revalidatePath("/admin/scheduler");
  return { id: machine.id };
}

export async function updateMachine(id: string, input: unknown) {
  const data = parseOrThrow(machineCoreSchema, input);
  const user = await requireWriter();

  const before = await prisma.machine.findFirstOrThrow({
    where: { id, companyId: user.companyId },
  });

  // Check for name collision (only if the name has changed).
  if (before.name !== data.name) {
    const dup = await prisma.machine.findFirst({
      where: {
        companyId: user.companyId,
        name: data.name,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) throw new Error(`A machine with name "${data.name}" already exists.`);
  }

  await assertAreaInCompany(data.workAreaId, user.companyId);

  await prisma.machine.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      workAreaId: data.workAreaId || null,
      maxLengthMm: data.maxLengthMm ?? null,
      maxWidthMm: data.maxWidthMm ?? null,
      maxHeightMm: data.maxHeightMm ?? null,
      maxWeightKg: data.maxWeightKg ?? null,
      chargeCapacityM2: data.chargeCapacityM2 ?? null,
      isActive: data.isActive,
    },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Machine",
    entityId: id,
    oldValue: {
      name: before.name,
      type: before.type,
      workAreaId: before.workAreaId,
      isActive: before.isActive,
    },
    newValue: {
      name: data.name,
      type: data.type,
      workAreaId: data.workAreaId ?? null,
      isActive: data.isActive,
    },
  });

  revalidatePath("/admin/machines");
  revalidatePath(`/admin/machines/${id}`);
  revalidatePath("/admin/scheduler");
  return { id };
}

/**
 * Quick update for work area assignment (inline editor in the list view).
 * Saves a round trip through the full form.
 */
export async function setMachineWorkArea(
  machineId: string,
  workAreaId: string | null,
) {
  const user = await requireWriter();

  const before = await prisma.machine.findFirstOrThrow({
    where: { id: machineId, companyId: user.companyId },
    select: { id: true, name: true, workAreaId: true },
  });
  if (before.workAreaId === (workAreaId ?? null)) return; // no-op

  await assertAreaInCompany(workAreaId, user.companyId);

  await prisma.machine.update({
    where: { id: machineId },
    data: { workAreaId: workAreaId || null },
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Machine",
    entityId: machineId,
    oldValue: { workAreaId: before.workAreaId },
    newValue: { workAreaId: workAreaId ?? null },
    reason: `Area for machine "${before.name}" changed`,
  });

  revalidatePath("/admin/machines");
  revalidatePath("/admin/scheduler");
}

export async function archiveMachine(id: string) {
  const user = await requireWriter();
  const machine = await prisma.machine.findFirstOrThrow({
    where: { id, companyId: user.companyId },
    select: { id: true, name: true },
  });
  await prisma.machine.update({
    where: { id },
    data: { archivedAt: new Date(), isActive: false },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Machine",
    entityId: id,
    reason: `Machine "${machine.name}" archived`,
  });
  revalidatePath("/admin/machines");
}

export async function unarchiveMachine(id: string) {
  const user = await requireWriter();
  await prisma.machine.findFirstOrThrow({
    where: { id, companyId: user.companyId },
    select: { id: true },
  });
  await prisma.machine.update({
    where: { id },
    data: { archivedAt: null, isActive: true },
  });
  revalidatePath("/admin/machines");
}