/**
 * POST /api/owner/auth/change-password
 *
 * Self-Service-Passwortwechsel für den eingeloggten Owner. Pflicht:
 *   - aktuelle Owner-Session
 *   - korrektes aktuelles Passwort (verhindert "logged-in tab takeover")
 *   - neues Passwort ≥ 12 Zeichen
 *
 * Andere Owner-Sessions bleiben absichtlich gültig — wer alle anderen
 * Sitzungen kicken will, nutzt explizit /revoke-other-sessions.
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

  // Schutz gegen Trivial-Reuse: wenn das "neue" Passwort identisch zum alten
  // ist, lehnen wir ab. Vermeidet Audit-Lärm und unnötiges Re-Hashing.
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
