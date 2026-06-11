/**
 * POST /api/owner/tenants/[id]/delete — Mandant UNWIDERRUFLICH löschen.
 *
 * Vollständige Hard-Deletion samt aller Tenant-Daten und User. Schutz:
 *   - OWNER_ROOT + frischer Sudo
 *   - Mandant MUSS vorher suspendiert sein (Zwei-Stufen-Schutz)
 *   - Begründung Pflicht (≥ 10 Zeichen)
 *   - Forensik: ownerAudit TENANT_HARD_DELETED VOR der Löschung mit
 *     vollem Snapshot — die Audit-Zeile überlebt (targetCompanyId
 *     SetNull), der Snapshot im Payload bleibt erhalten.
 *
 * Löschreihenfolge ist FK-sicher: erst referenzierende, dann
 * referenzierte Tabellen; Sub-Children/Impersonation hängen an
 * onDelete:Cascade und werden automatisch mitgenommen.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
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

  // Zwei-Stufen-Schutz: nur ein bereits suspendierter Mandant ist löschbar.
  if (!company.suspendedAt) {
    return NextResponse.json({ error: "NOT_SUSPENDED" }, { status: 409 });
  }

  // Forensik VOR der Löschung schreiben (Company existiert noch, daher
  // targetCompanyId gültig; SetNull bewahrt die Zeile nach dem Delete,
  // der Snapshot im Payload bleibt lesbar).
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

  // FK-sichere Reihenfolge: referenzierende vor referenzierten Tabellen.
  // Sonderfall: OrderScheduleEntry.order und ProcessStepTimeEvent.employee
  // sind PFLICHT-Relationen OHNE onDelete (Prisma-Default = Restrict) und
  // haben kein eigenes companyId — sie blockieren sonst order- bzw.
  // employee-Löschung trotz Cascade über ProcessStep. Daher zuerst über
  // die Relation entfernen. Übrige Sub-Children (OrderItem, TimeEntry,
  // Contact, ParameterChangeLog …) + Impersonation hängen an Cascade.
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

        // SystemParameter.updatedById / ParameterChangeLog.changedById sind
        // Pflicht-FKs auf User OHNE Cascade (Restrict). Durch die frühere
        // Per-Tenant-Migration zeigen FREMDER Mandanten Parameter-Zeilen
        // auf einen User dieser Firma → würde user.deleteMany blockieren.
        // Felder sind non-nullable: pro betroffener Fremdfirma auf einen
        // eigenen (überlebenden) User dieser Firma umhängen.
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
        // Cascade nimmt ImpersonationConsentToken/Session mit; OwnerAuditLog
        // targetCompanyId/targetUserId werden auf NULL gesetzt (Spur bleibt).
        await tx.company.delete({ where: { id } });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    console.error("[tenant-hard-delete] failed", { companyId: id, message });
    return NextResponse.json(
      { error: "DELETE_FAILED", message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
