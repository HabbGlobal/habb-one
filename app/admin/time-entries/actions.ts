"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { combineDateAndTime, localDateString, localMidnightUtc } from "@/lib/time/zone";
import { computeWorkedTime } from "@/lib/time/calc";

async function requireCorrector() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTH");
  if (!hasPermission(session.user.role, "timeEntries.correct")) throw new Error("FORBIDDEN");
  return session.user;
}

async function refreshEntry(timeEntryId: string) {
  const entry = await prisma.timeEntry.findUniqueOrThrow({
    where: { id: timeEntryId },
    include: { punches: true, breaks: true },
  });
  const result = computeWorkedTime({
    punches: entry.punches.map((p) => ({ type: p.type, occurredAt: p.occurredAt })),
    breaks: entry.breaks.map((b) => ({ startedAt: b.startedAt, endedAt: b.endedAt })),
  });
  const sorted = [...entry.punches].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  await prisma.timeEntry.update({
    where: { id: timeEntryId },
    data: {
      workedMinutes: result.workedMinutes,
      breakMinutes: result.breakMinutes,
      status: entry.punches.length === 0 ? "EMPTY" : result.isOnBreak ? "ON_BREAK" : result.isOpen ? "OPEN" : "CLOSED",
      firstIn: sorted.find((p) => p.type === "CLOCK_IN")?.occurredAt ?? null,
      lastOut: [...sorted].reverse().find((p) => p.type === "CLOCK_OUT")?.occurredAt ?? null,
    },
  });
}

const addSchema = z.object({
  timeEntryId: z.string().cuid(),
  employeeId: z.string().cuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().min(1),
});

export async function addCorrectionPunch(input: z.infer<typeof addSchema>) {
  const user = await requireCorrector();
  const data = addSchema.parse(input);
  const entry = await prisma.timeEntry.findUniqueOrThrow({ where: { id: data.timeEntryId }, include: { employee: true } });
  if (entry.employee.companyId !== user.companyId) throw new Error("FORBIDDEN");

  const occurredAt = combineDateAndTime(data.workDate, data.time);

  const punch = await prisma.timePunch.create({
    data: {
      timeEntryId: data.timeEntryId,
      employeeId: data.employeeId,
      type: data.type,
      occurredAt,
      source: "ADMIN_CORRECTION",
      correctedById: user.id,
      reason: data.reason,
    },
  });
  if (data.type === "BREAK_START") {
    await prisma.breakEntry.create({
      data: {
        timeEntryId: data.timeEntryId,
        startedAt: occurredAt,
        source: "ADMIN_CORRECTION",
      },
    });
  }
  if (data.type === "BREAK_END") {
    const open = await prisma.breakEntry.findFirst({
      where: { timeEntryId: data.timeEntryId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (open) {
      const minutes = Math.max(0, Math.round((occurredAt.getTime() - open.startedAt.getTime()) / 60000));
      await prisma.breakEntry.update({ where: { id: open.id }, data: { endedAt: occurredAt, minutes } });
    }
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: data.employeeId,
    action: "CREATE",
    entityType: "TimePunch",
    entityId: punch.id,
    newValue: { type: data.type, occurredAt: occurredAt.toISOString() },
    reason: data.reason,
  });

  await refreshEntry(data.timeEntryId);
  revalidatePath(`/admin/time-entries/${data.timeEntryId}`);
}

const deleteSchema = z.object({
  punchId: z.string().cuid(),
  timeEntryId: z.string().cuid(),
  reason: z.string().min(1),
});

export async function deletePunch(input: z.infer<typeof deleteSchema>) {
  const user = await requireCorrector();
  const data = deleteSchema.parse(input);

  const punch = await prisma.timePunch.findUniqueOrThrow({
    where: { id: data.punchId },
    include: { timeEntry: { include: { employee: true } } },
  });
  if (punch.timeEntry.employee.companyId !== user.companyId) throw new Error("FORBIDDEN");

  await prisma.timePunch.delete({ where: { id: data.punchId } });

  // Keep BreakEntry (the Attendance sheet's data source for break
  // intervals/live-break state) in sync — addCorrectionPunch/addPunch both
  // mirror BREAK_START/BREAK_END into BreakEntry, so deletion must undo the
  // same mirroring or the Attendance sheet keeps showing the deleted break.
  if (punch.type === "BREAK_START") {
    await prisma.breakEntry.deleteMany({
      where: { timeEntryId: data.timeEntryId, startedAt: punch.occurredAt },
    });
  }
  if (punch.type === "BREAK_END") {
    await prisma.breakEntry.updateMany({
      where: { timeEntryId: data.timeEntryId, endedAt: punch.occurredAt },
      data: { endedAt: null, minutes: null },
    });
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    employeeId: punch.employeeId,
    action: "DELETE",
    entityType: "TimePunch",
    entityId: data.punchId,
    oldValue: { type: punch.type, occurredAt: punch.occurredAt.toISOString() },
    reason: data.reason,
  });

  await refreshEntry(data.timeEntryId);
  revalidatePath(`/admin/time-entries/${data.timeEntryId}`);
}
