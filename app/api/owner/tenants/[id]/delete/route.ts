/**
 * POST /api/owner/tenants/[id]/delete: irreversibly delete a tenant.
 *
 * Full hard deletion including all tenant data and users. Safeguards:
 *   - OWNER_ROOT + fresh sudo
 *   - Tenant MUST already be suspended (two-step protection)
 *   - Reason required (at least 10 characters)
 *   - Forensics: write ownerAudit TENANT_HARD_DELETED BEFORE deletion with
 *     a full snapshot. The audit row survives (targetCompanyId SetNull), and
 *     the snapshot remains in the payload.
 *
 * Deletion order is FK-safe: referencing tables first, then referenced tables.
 * Sub-children/impersonation records use onDelete:Cascade and are removed
 * automatically.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  reason: z.string().trim().min(10, "Reason must be at least 10 characters long."),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ROOT", sudo: true });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" },
      { status: guard.status },
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      plan: true,
      suspendedAt: true,
      _count: {
        select: {
          users: true,
          employees: true,
          customers: true,
          orders: true,
          quotes: true,
          invoices: true,
        },
      },
    },
  });
  if (!company) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Two-step protection: only an already suspended tenant can be deleted.
  if (!company.suspendedAt) {
    return NextResponse.json({ error: "NOT_SUSPENDED" }, { status: 409 });
  }

  // Write forensics BEFORE deletion while Company still exists, so
  // targetCompanyId is valid. SetNull preserves the row after delete, and the
  // payload snapshot remains readable.
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_HARD_DELETED",
    targetCompanyId: id,
    reason: parsed.data.reason,
    payloadBefore: {
      companyId: company.id,
      name: company.name,
      plan: company.plan,
      counts: company._count,
    },
  });

  // FK-safe order: referencing tables before referenced tables. Special case:
  // OrderScheduleEntry.order and ProcessStepTimeEvent.employee are required
  // relations WITHOUT onDelete (Prisma default = Restrict) and have no companyId
  // of their own, so they would otherwise block order/employee deletion despite
  // Cascade through ProcessStep. Remove them through the relation first.
  // Remaining sub-children (OrderItem, TimeEntry, Contact, ParameterChangeLog,
  // etc.) and impersonation records use Cascade.
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.auditLog.deleteMany({ where: { companyId: id } });
        await tx.orderScheduleEntry.deleteMany({
          where: { order: { companyId: id } },
        });
        await tx.processStepTimeEvent.deleteMany({
          where: { employee: { companyId: id } },
        });
        await tx.invoice.deleteMany({ where: { companyId: id } });
        await tx.quote.deleteMany({ where: { companyId: id } });
        await tx.order.deleteMany({ where: { companyId: id } });
        await tx.customer.deleteMany({ where: { companyId: id } });
        await tx.scheduleMonth.deleteMany({ where: { companyId: id } });
        await tx.scheduleTemplate.deleteMany({ where: { companyId: id } });
        await tx.processTemplate.deleteMany({ where: { companyId: id } });
        await tx.machine.deleteMany({ where: { companyId: id } });
        await tx.workArea.deleteMany({ where: { companyId: id } });
        await tx.employee.deleteMany({ where: { companyId: id } });
        await tx.absenceType.deleteMany({ where: { companyId: id } });
        await tx.holiday.deleteMany({ where: { companyId: id } });
        await tx.systemParameter.deleteMany({ where: { companyId: id } });
        await tx.rolePermission.deleteMany({ where: { companyId: id } });
        await tx.tenantEntitlement.deleteMany({ where: { companyId: id } });

        // SystemParameter.updatedById / ParameterChangeLog.changedById are
        // required FKs to User WITHOUT Cascade (Restrict). Because of the
        // earlier per-tenant migration, parameter rows from OTHER tenants can
        // point to a user of this company, which would block user.deleteMany.
        // Fields are non-nullable: for each affected external company, reassign
        // to one of that company's own surviving users.
        const doomed = (
          await tx.user.findMany({
            where: { companyId: id },
            select: { id: true },
          })
        ).map((u) => u.id);

        if (doomed.length > 0) {
          const badParams = await tx.systemParameter.findMany({
            where: { updatedById: { in: doomed } },
            select: { companyId: true },
          });
          for (const cid of [...new Set(badParams.map((p) => p.companyId))]) {
            const repl = await tx.user.findFirst({
              where: { companyId: cid, id: { notIn: doomed } },
              select: { id: true },
            });
            if (repl) {
              await tx.systemParameter.updateMany({
                where: { companyId: cid, updatedById: { in: doomed } },
                data: { updatedById: repl.id },
              });
            }
          }

          const badLogs = await tx.parameterChangeLog.findMany({
            where: { changedById: { in: doomed } },
            select: { parameterCompanyId: true },
          });
          for (const cid of [
            ...new Set(badLogs.map((l) => l.parameterCompanyId)),
          ]) {
            const repl = await tx.user.findFirst({
              where: { companyId: cid, id: { notIn: doomed } },
              select: { id: true },
            });
            if (repl) {
              await tx.parameterChangeLog.updateMany({
                where: {
                  parameterCompanyId: cid,
                  changedById: { in: doomed },
                },
                data: { changedById: repl.id },
              });
            }
          }
        }

        await tx.user.deleteMany({ where: { companyId: id } });
        // Cascade removes ImpersonationConsentToken/Session; OwnerAuditLog
        // targetCompanyId/targetUserId are set to NULL, preserving the trail.
        await tx.company.delete({ where: { id } });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[tenant-hard-delete] failed", { companyId: id, message });
    return NextResponse.json(
      { error: "DELETE_FAILED", message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
