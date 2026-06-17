/**
 * POST /api/owner/auth/change-password
 *
 * Self-service password change for the logged-in owner. Required:
 *   - current owner session
 *   - correct current password (prevents "logged-in tab takeover")
 *   - new password at least 12 characters
 *
 * Other owner sessions intentionally remain valid. To end all other sessions,
 * explicitly use /revoke-other-sessions.
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

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, "WEAK_PASSWORD").max(200),
});

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner();
  if (!guard.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const code = parsed.error.errors[0]?.message === "WEAK_PASSWORD"
      ? "WEAK_PASSWORD"
      : "INVALID";
    return NextResponse.json({ error: code }, { status: 400 });
  }

  const account = await prisma.ownerAccount.findUnique({
    where: { id: guard.ctx.ownerAccountId },
    select: { id: true, passwordHash: true },
  });
  if (!account) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ok = await bcrypt.compare(parsed.data.currentPassword, account.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 400 });
  }

  // Protect against trivial reuse: reject when the "new" password is identical
  // to the old one. Avoids audit noise and unnecessary re-hashing.
  const sameAsOld = await bcrypt.compare(parsed.data.newPassword, account.passwordHash);
  if (sameAsOld) {
    return NextResponse.json({ error: "SAME_PASSWORD" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.ownerAccount.update({
    where: { id: account.id },
    data: { passwordHash: newHash },
  });

  return NextResponse.json({ ok: true });
}
