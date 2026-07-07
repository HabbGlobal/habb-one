"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hashPin, generatePin } from "@/lib/pin";
import { recordAudit } from "@/lib/audit";
import { employeeFormSchema } from "@/lib/validation/employee";
import { hasPermission } from "@/lib/permissions";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");
  if (!hasPermission(session.user.role, "employees.write")) {
    throw new Error("No permission.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    // Zod gives one issue per failed field — surface the first so the form can
    // display a meaningful message instead of a JSON dump.
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `${path}: ${issue.message}` : issue.message);
  }
  return parsed.data;
}

function explainPrismaError(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      if (target.includes("employeeNumber")) {
        return "This employee number is already taken.";
      }
      return `Uniqueness conflict: ${target}`;
    }
    if (err.code === "P2025") return "Record not found.";
  }
  return null;
}

export async function createEmployee(input: unknown) {
  try {
    const user = await requireAdmin();
  const data = parseOrThrow(employeeFormSchema, input);
  const pin = generatePin();
  const pinHash = await hashPin(pin);

  let employee;
  try {
    employee = await prisma.employee.create({
      data: {
        companyId: user.companyId,
        employeeNumber: data.employeeNumber,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        preferredLanguage: data.preferredLanguage,
        isActive: data.isActive,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
        address: data.address || null,
        ahvNumber: data.ahvNumber || null,
        employmentType: data.employmentType,
        workloadPercent: data.workloadPercent,
        weeklyTargetHours: data.weeklyTargetHours,
        defaultBreakMinutes: data.defaultBreakMinutes,
        annualVacationDays: data.annualVacationDays,
        initialOvertimeHours: data.initialOvertimeHours,
        initialVacationDays: data.initialVacationDays,
        notes: data.notes || null,
        pinHash,
        scheduleDays: data.scheduleDays
          ? {
              create: (Object.keys(data.scheduleDays) as Array<keyof typeof data.scheduleDays>).map(
                (k) => ({ weekday: k, targetHours: data.scheduleDays![k] })
              ),
            }
          : undefined,
        workAreas: data.workAreaIds.length
          ? { create: data.workAreaIds.map((workAreaId) => ({ workAreaId })) }
          : undefined,
        skills: data.skills.length
          ? {
              create: data.skills.map((s) => ({
                skillCode: s.skillCode,
                level: s.level,
                certifiedUntil: s.certifiedUntil ? new Date(s.certifiedUntil) : null,
              })),
            }
          : undefined,
      },
    });
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: employee.id,
    action: "CREATE",
    entityType: "Employee",
    entityId: employee.id,
    newValue: { firstName: data.firstName, lastName: data.lastName, employeeNumber: data.employeeNumber },
  });

    revalidatePath("/admin/employees");
    return { id: employee.id, pin };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An error occurred." };
  }
}

export async function updateEmployee(id: string, input: unknown) {
  try {
    const user = await requireAdmin();
  const data = parseOrThrow(employeeFormSchema, input);

  const before = await prisma.employee.findUniqueOrThrow({ where: { id } });
  if (before.companyId !== user.companyId) throw new Error("No permission.");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          employeeNumber: data.employeeNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
          preferredLanguage: data.preferredLanguage,
          isActive: data.isActive,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          address: data.address || null,
          ahvNumber: data.ahvNumber || null,
          employmentType: data.employmentType,
          workloadPercent: data.workloadPercent,
          weeklyTargetHours: data.weeklyTargetHours,
          defaultBreakMinutes: data.defaultBreakMinutes,
          annualVacationDays: data.annualVacationDays,
          initialOvertimeHours: data.initialOvertimeHours,
          initialVacationDays: data.initialVacationDays,
          notes: data.notes || null,
        },
      });
      if (data.scheduleDays) {
        await tx.workScheduleDay.deleteMany({ where: { employeeId: id } });
        await tx.workScheduleDay.createMany({
          data: (Object.keys(data.scheduleDays) as Array<keyof typeof data.scheduleDays>).map(
            (k) => ({ employeeId: id, weekday: k, targetHours: data.scheduleDays![k] })
          ),
        });
      }
      // Replace area assignments wholesale: delete + insert. Cheaper and
      // simpler than diffing for a small set of memberships.
      await tx.employeeWorkArea.deleteMany({ where: { employeeId: id } });
      if (data.workAreaIds.length > 0) {
        await tx.employeeWorkArea.createMany({
          data: data.workAreaIds.map((workAreaId) => ({ employeeId: id, workAreaId })),
        });
      }
      // Skills genauso wholesale ersetzen.
      await tx.employeeSkill.deleteMany({ where: { employeeId: id } });
      if (data.skills.length > 0) {
        await tx.employeeSkill.createMany({
          data: data.skills.map((s) => ({
            employeeId: id,
            skillCode: s.skillCode,
            level: s.level,
            certifiedUntil: s.certifiedUntil ? new Date(s.certifiedUntil) : null,
          })),
        });
      }
    });
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: id,
    action: "UPDATE",
    entityType: "Employee",
    entityId: id,
    oldValue: {
      firstName: before.firstName,
      lastName: before.lastName,
      isActive: before.isActive,
      employmentType: before.employmentType,
    },
    newValue: {
      firstName: data.firstName,
      lastName: data.lastName,
      isActive: data.isActive,
      employmentType: data.employmentType,
    },
  });

    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${id}`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An error occurred." };
  }
}

export async function resetEmployeePin(id: string) {
  const user = await requireAdmin();
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id } });
  if (employee.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const pin = generatePin();
  const pinHash = await hashPin(pin);
  await prisma.employee.update({
    where: { id },
    data: { pinHash, pinFailedAttempts: 0, pinLockedUntil: null },
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: id,
    action: "PIN_RESET",
    entityType: "Employee",
    entityId: id,
  });
  revalidatePath(`/admin/employees/${id}`);
  return pin;
}

export async function setEmployeeActive(id: string, isActive: boolean) {
  const user = await requireAdmin();
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id } });
  if (employee.companyId !== user.companyId) throw new Error("No permission.");
  await prisma.employee.update({ where: { id }, data: { isActive } });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: id,
    action: "UPDATE",
    entityType: "Employee",
    entityId: id,
    oldValue: { isActive: employee.isActive },
    newValue: { isActive },
  });
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
}

// ─────────────────────────────────────────
// Bulk lifecycle actions
// ─────────────────────────────────────────

const idsSchema = z.array(z.string().cuid()).min(1).max(500);

async function authorizeBulk(ids: string[]) {
  const user = await requireAdmin();
  const owned = await prisma.employee.findMany({
    where: { id: { in: ids }, companyId: user.companyId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new Error("At least one entry does not belong to this company.");
  }
  return user;
}

export async function bulkArchiveEmployees(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.employee.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: new Date(), isActive: false },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      employeeId: id,
      action: "UPDATE",
      entityType: "Employee",
      entityId: id,
      newValue: { archivedAt: new Date().toISOString() },
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/employees");
}

export async function bulkDeleteEmployees(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.employee.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { deletedAt: new Date(), isActive: false },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      employeeId: id,
      action: "DELETE",
      entityType: "Employee",
      entityId: id,
      reason: "Bulk soft-delete",
    });
  }
  revalidatePath("/admin/employees");
}

export async function bulkRestoreEmployees(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.employee.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: null, deletedAt: null, isActive: true },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      employeeId: id,
      action: "UPDATE",
      entityType: "Employee",
      entityId: id,
      newValue: { restored: true },
      reason: "Bulk restore",
    });
  }
  revalidatePath("/admin/employees");
}

export async function bulkHardDeleteEmployees(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  // Hard delete cascades to TimeEntry, Punches, Breaks, ScheduleEntries via
  // onDelete: Cascade in the schema. Audit row stays — entityId still points
  // to the removed row but that's fine for forensic purposes.
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId,
      userId: user.id,
      employeeId: id,
      action: "DELETE",
      entityType: "Employee",
      entityId: id,
      reason: "Bulk hard delete (purge)",
    });
  }
  await prisma.employee.deleteMany({
    where: { id: { in: ids }, companyId: user.companyId },
  });
  revalidatePath("/admin/employees");
}
