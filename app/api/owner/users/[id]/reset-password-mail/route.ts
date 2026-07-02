/**
 * POST /api/owner/users/[id]/reset-password-mail
 *
 * Creates a single-use magic link and sends it to the user via Resend.
 * The owner NEVER sees the plaintext token; only the email recipient does.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { issuePasswordResetToken } from "@/lib/auth/password-reset";
import { sendMail } from "@/lib/mail/send";
import { buildPasswordResetMail } from "@/lib/mail/templates/password-reset";

const schema = z.object({
  reason: z.string().trim().min(10, "Reason must be at least 10 characters long."),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_SUPPORT" });
  if (!guard.ok) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      companyId: true,
      isActive: true,
      lockedAt: true,
      deletedAt: true,
    },
  });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { token, expiresAt } = await issuePasswordResetToken({
    userId: user.id,
    initiatedByOwnerAccountId: guard.ctx.ownerAccountId,
  });

  const origin = new URL(req.url).origin;
  const resetUrl = `${origin}/reset-password/${token}`;
  const mail = buildPasswordResetMail({
    recipientName: user.name,
    resetUrl,
    expiresAt,
    initiatedByName: guard.ctx.name,
    initiatedByLabel: "HABB Global (PVT) LTD Support",
  });

  let delivered = false;
  try {
    const result = await sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "password-reset",
    });
    delivered = result.delivered;
  } catch {
    // Still write the audit entry so the owner can see that delivery failed
    // and start a second attempt.
    delivered = false;
  }

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "USER_PASSWORD_RESET_LINK_SENT",
    targetCompanyId: user.companyId,
    targetUserId: user.id,
    reason: parsed.data.reason,
    payloadAfter: { delivered, expiresAt: expiresAt.toISOString() },
  });

  return NextResponse.json({ ok: true, delivered, expiresAt: expiresAt.toISOString() });
}
