/**
 * PATCH /api/owner/diagnostics/findings/[id]  { status, reason? }
 * Finding bestätigen / lösen / ignorieren. OWNER_ADMIN. Auditiert.
 * 'ignored' verlangt eine Begründung (≥ 5 Zeichen).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z
  .object({
    status: z.enum(["open", "acknowledged", "resolved", "ignored"]),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.status !== "ignored" || (v.reason && v.reason.length >= 5), {
    message: "A reason is required when ignoring a finding (at least 5 characters).",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
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

  const before = await prisma.diagnosticFinding.findUnique({
    where: { id },
    select: { id: true, companyId: true, status: true, title: true },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.diagnosticFinding.update({
    where: { id },
    data: {
      status: parsed.data.status,
      resolvedAt: parsed.data.status === "resolved" ? new Date() : null,
    },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "DIAGNOSTICS_FINDING_UPDATED",
    targetCompanyId: before.companyId,
    reason: parsed.data.reason,
    payloadBefore: { status: before.status, title: before.title },
    payloadAfter: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true });
}
