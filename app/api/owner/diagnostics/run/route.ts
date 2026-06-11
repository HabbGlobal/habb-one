/**
 * POST /api/owner/diagnostics/run  { companyId }
 * Manuelle Diagnose eines Mandanten. OWNER_ADMIN. Rate-Limit: max.
 * 1 manueller Lauf / Mandant / 60 s (DB-basiert, serverless-sicher).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { runDiagnosticsForCompany } from "@/lib/diagnostics/engine";

const schema = z.object({ companyId: z.string().cuid() });

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const company = await prisma.company.findUnique({
    where: { id: parsed.data.companyId },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const recent = await prisma.diagnosticRun.findFirst({
    where: {
      companyId: company.id,
      triggeredBy: "manual",
      startedAt: { gte: new Date(Date.now() - 60_000) },
    },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const outcome = await runDiagnosticsForCompany(company.id, "manual");
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "DIAGNOSTICS_RUN_MANUAL",
    targetCompanyId: company.id,
    payloadAfter: { score: outcome.score, health: outcome.health },
  });
  return NextResponse.json({ ok: true, outcome });
}
