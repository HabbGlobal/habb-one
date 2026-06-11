/**
 * POST /api/owner/auth/revoke-other-sessions
 *
 * Beendet alle Owner-Sessions des eingeloggten Accounts, AUSSER der
 * aktuell verwendeten. Owner muss aktuelles Passwort bestätigen, damit
 * ein liegen gebliebener Tab niemanden ausloggen kann.
 *
 * Revoke = setze revokedAt — die Sessions bleiben in der DB, damit der
 * Audit-Trail nachvollzieht, wann sie geschlossen wurden.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  isOwnerPortalEnabled,
  ownerPortalDisabledResponse,
} from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner();
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const account = await prisma.ownerAccount.findUnique({
    where: { id: guard.ctx.ownerAccountId },
    select: { id: true, passwordHash: true },
  });
  if (!account) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ok = await bcrypt.compare(parsed.data.password, account.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 400 });
  }

  const result = await prisma.ownerSession.updateMany({
    where: {
      ownerAccountId: account.id,
      id: { not: guard.ctx.sessionId },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true, revoked: result.count });
}
