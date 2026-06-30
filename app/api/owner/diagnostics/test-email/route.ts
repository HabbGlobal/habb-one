/**
 * POST /api/owner/diagnostics/test-email
 * Manual test email (check mail configuration). OWNER_ADMIN. Rate limit:
 * max. 1 / 60 s (DB-based via manual_test notification). Audited.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { sendManualTestEmail } from "@/lib/diagnostics/notify";

export async function POST() {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();
  const guard = await requireOwner({ minRole: "OWNER_ADMIN" });
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }

  const recent = await prisma.diagnosticEmailNotification.findFirst({
    where: {
      notificationType: "manual_test",
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const res = await sendManualTestEmail();
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "DIAGNOSTICS_TEST_EMAIL",
    payloadAfter: { ok: res.ok, recipientConfigured: res.recipient !== null },
  });

  if (!res.recipient) {
    return NextResponse.json({ error: "NO_RECIPIENT" }, { status: 400 });
  }
  return NextResponse.json({ ok: res.ok });
}
