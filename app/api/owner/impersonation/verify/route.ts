/**
 * POST /api/owner/impersonation/verify
 *
 * Schritt 2 der Impersonation: Owner tippt den vom Kunden erfragten OTP
 * ein. Bei Erfolg legen wir die `ImpersonationSession` an und setzen den
 * `habb-impersonation`-Cookie, womit der Tenant-`auth()`-Wrapper den
 * Owner als targetUser durchreicht.
 *
 * Brute-Force-Schutz: max. 5 falsche Versuche, dann ist der Token
 * gesperrt (consumedAt-Markierung mit Fail-Flag).
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
  MAX_OTP_ATTEMPTS,
  compareOtp,
  setImpersonationCookie,
  signImpersonationToken,
} from "@/lib/owner/impersonation";

const schema = z.object({
  consentTokenId: z.string().min(1),
  otp: z.string().trim().regex(/^\d{6}$/, "OTP muss 6-stellig sein."),
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
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const token = await prisma.impersonationConsentToken.findUnique({
    where: { id: parsed.data.consentTokenId },
    include: {
      targetUser: { select: { id: true, name: true, email: true } },
      targetCompany: { select: { id: true, name: true, suspendedAt: true } },
    },
  });

  if (!token) {
    return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });
  }

  // Owner-Wechsel verhindern: derselbe Owner, der den Token angelegt hat,
  // muss ihn auch einlösen. Schutz gegen "anderer Owner stiehlt offenen Token".
  if (token.ownerAccountId !== guard.ctx.ownerAccountId) {
    return NextResponse.json({ error: "TOKEN_OWNER_MISMATCH" }, { status: 403 });
  }
  if (token.consumedAt || token.cancelledAt) {
    return NextResponse.json({ error: "TOKEN_USED" }, { status: 409 });
  }
  if (token.expiresAt.getTime() <= Date.now()) {
    await ownerAudit({
      ownerAccountId: guard.ctx.ownerAccountId,
      ownerEmail: guard.ctx.ownerEmail,
      action: "IMPERSONATION_OTP_EXPIRED",
      targetCompanyId: token.targetCompanyId,
      targetUserId: token.targetUserId,
      payloadAfter: { consentTokenId: token.id },
    });
    return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 410 });
  }

  if (token.attempts >= MAX_OTP_ATTEMPTS) {
    return NextResponse.json({ error: "TOO_MANY_ATTEMPTS" }, { status: 429 });
  }

  const ok = await compareOtp(parsed.data.otp, token.codeHash);
  if (!ok) {
    await prisma.impersonationConsentToken.update({
      where: { id: token.id },
      data: { attempts: { increment: 1 } },
    });
    await ownerAudit({
      ownerAccountId: guard.ctx.ownerAccountId,
      ownerEmail: guard.ctx.ownerEmail,
      action: "IMPERSONATION_OTP_FAILED",
      targetCompanyId: token.targetCompanyId,
      targetUserId: token.targetUserId,
      payloadAfter: {
        consentTokenId: token.id,
        attemptsAfter: token.attempts + 1,
      },
    });
    const remaining = MAX_OTP_ATTEMPTS - (token.attempts + 1);
    return NextResponse.json(
      { error: "WRONG_OTP", attemptsLeft: Math.max(0, remaining) },
      { status: 400 },
    );
  }

  // Defensive Re-checks bevor die Session steht (User könnte zwischen
  // Request und Verify gelöscht/gesperrt worden sein).
  if (token.targetCompany.suspendedAt) {
    return NextResponse.json({ error: "COMPANY_SUSPENDED" }, { status: 400 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + token.requestedDurationMinutes * 60 * 1000);

  // Token konsumieren + Session anlegen atomar.
  const session = await prisma.$transaction(async (tx) => {
    await tx.impersonationConsentToken.update({
      where: { id: token.id },
      data: { consumedAt: now },
    });
    return tx.impersonationSession.create({
      data: {
        consentTokenId: token.id,
        ownerAccountId: token.ownerAccountId,
        targetUserId: token.targetUserId,
        targetCompanyId: token.targetCompanyId,
        scope: token.scope,
        startedAt: now,
        expiresAt,
      },
      select: { id: true, startedAt: true, expiresAt: true, scope: true },
    });
  });

  const cookieToken = await signImpersonationToken(
    {
      impersonationSessionId: session.id,
      ownerAccountId: token.ownerAccountId,
      targetUserId: token.targetUserId,
      targetCompanyId: token.targetCompanyId,
      scope: session.scope,
    },
    expiresAt,
  );
  const maxAgeSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await setImpersonationCookie(cookieToken, maxAgeSeconds);

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "IMPERSONATION_OTP_VERIFIED",
    targetCompanyId: token.targetCompanyId,
    targetUserId: token.targetUserId,
    payloadAfter: { consentTokenId: token.id, sessionId: session.id },
  });
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "IMPERSONATION_STARTED",
    targetCompanyId: token.targetCompanyId,
    targetUserId: token.targetUserId,
    payloadAfter: {
      sessionId: session.id,
      scope: session.scope,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    scope: session.scope,
    expiresAt: expiresAt.toISOString(),
    redirectTo: "/admin",
  });
}
