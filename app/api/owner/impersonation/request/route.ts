/**
 * POST /api/owner/impersonation/request
 *
 * Step 1 of impersonation: the owner wants to sign in as targetUserId.
 * We generate a 6-digit OTP, write the bcrypt hash to
 * `ImpersonationConsentToken`, and send the plaintext code by email to the
 * tenant user. The owner NEVER sees the code; they must ask the customer for it
 * directly.
 *
 * Required: sudo + reason + minimum/maximum duration. Tenant SUPERADMINs may be
 * impersonated, but impersonation of deleted/locked users is forbidden.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  isOwnerPortalEnabled,
  ownerPortalDisabledResponse,
} from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import {
  CONSENT_TTL_MINUTES,
  MAX_SESSION_DURATION_MINUTES,
  MIN_SESSION_DURATION_MINUTES,
  generateOtp,
  hashOtp,
} from "@/lib/owner/impersonation";
import { buildImpersonationConsentMail } from "@/lib/mail/templates/impersonation";
import { sendMail } from "@/lib/mail/send";

const schema = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().trim().min(10, "Reason must be at least 10 characters long.").max(500),
  ticketRef: z.string().trim().max(120).optional().nullable(),
  scope: z.enum(["READONLY", "FULL"]),
  durationMinutes: z
    .number()
    .int()
    .min(MIN_SESSION_DURATION_MINUTES)
    .max(MAX_SESSION_DURATION_MINUTES),
});

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_SUPPORT", sudo: true });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" },
      { status: guard.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.targetUserId },
    include: {
      company: { select: { id: true, name: true, suspendedAt: true } },
    },
  });

  if (!target) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ error: "USER_DELETED" }, { status: 400 });
  }
  if (target.lockedAt) {
    return NextResponse.json({ error: "USER_LOCKED" }, { status: 400 });
  }
  if (!target.isActive) {
    return NextResponse.json({ error: "USER_INACTIVE" }, { status: 400 });
  }
  if (target.company.suspendedAt) {
    return NextResponse.json({ error: "COMPANY_SUSPENDED" }, { status: 400 });
  }

  // Generate OTP and persist token.
  const otp = generateOtp();
  const codeHash = await hashOtp(otp);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CONSENT_TTL_MINUTES * 60 * 1000);

  const consent = await prisma.impersonationConsentToken.create({
    data: {
      ownerAccountId: guard.ctx.ownerAccountId,
      targetUserId: target.id,
      targetCompanyId: target.company.id,
      codeHash,
      reason: parsed.data.reason,
      ticketRef: parsed.data.ticketRef ?? null,
      scope: parsed.data.scope,
      requestedDurationMinutes: parsed.data.durationMinutes,
      expiresAt,
    },
    select: { id: true },
  });

  // Build and send mail on a best-effort basis, but mark the status on the
  // token so the owner knows if delivery failed.
  const mail = buildImpersonationConsentMail({
    recipientName: target.name,
    ownerName: guard.ctx.name,
    ownerLabel: "HABB Global (PVT) LTD Support",
    otp,
    reason: parsed.data.reason,
    ticketRef: parsed.data.ticketRef ?? null,
    scope: parsed.data.scope,
    durationMinutes: parsed.data.durationMinutes,
    expiresAt,
    companyName: target.company.name,
  });

  let emailDelivered = false;
  try {
    const result = await sendMail({
      to: target.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "impersonation-consent",
    });
    emailDelivered = result.delivered;
    await prisma.impersonationConsentToken.update({
      where: { id: consent.id },
      data: {
        emailSentAt: new Date(),
        emailDeliveryStatus: emailDelivered ? "SENT" : "PENDING",
      },
    });
  } catch {
    await prisma.impersonationConsentToken.update({
      where: { id: consent.id },
      data: { emailDeliveryStatus: "FAILED" },
    });
  }

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "IMPERSONATION_REQUESTED",
    targetCompanyId: target.company.id,
    targetUserId: target.id,
    reason: parsed.data.reason,
    payloadAfter: {
      consentTokenId: consent.id,
      scope: parsed.data.scope,
      durationMinutes: parsed.data.durationMinutes,
      ticketRef: parsed.data.ticketRef ?? null,
      emailDelivered,
    },
  });

  return NextResponse.json({
    ok: true,
    consentTokenId: consent.id,
    expiresAt: expiresAt.toISOString(),
    emailDelivered,
    targetEmailMasked: maskEmail(target.email),
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const first = local.slice(0, 2);
  return `${first}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
