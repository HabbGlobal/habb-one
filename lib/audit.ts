import { prisma } from "@/lib/prisma";
import type { AuditAction, Prisma } from "@prisma/client";

interface AuditEntry {
  companyId: string;
  userId?: string | null;
  employeeId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(entry: AuditEntry) {
  await prisma.auditLog.create({
    data: {
      companyId: entry.companyId,
      userId: entry.userId ?? null,
      employeeId: entry.employeeId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldValue: (entry.oldValue ?? undefined) as Prisma.InputJsonValue | undefined,
      newValue: (entry.newValue ?? undefined) as Prisma.InputJsonValue | undefined,
      reason: entry.reason ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
