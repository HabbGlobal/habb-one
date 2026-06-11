/**
 * POST /api/auth/password-reset
 *
 * Public endpoint — Konsumiert einen Magic-Link-Token und setzt das neue
 * Passwort. Atomisch: verify → update user → consume token. Sessions des
 * Users werden via sessionEpoch invalidiert.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyPasswordResetToken } from "@/lib/auth/password-reset";

const schema = z.object({
  token: z.string().min(16),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen lang sein."),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const verified = await verifyPasswordResetToken(parsed.data.token);
  if (!verified) {
    return NextResponse.json({ error: "INVALID_OR_EXPIRED" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { id: true, deletedAt: true, lockedAt: true, sessionEpoch: true },
  });
  if (!user || user.deletedAt || user.lockedAt) {
    return NextResponse.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 401 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // Konsumiere Token + setze Passwort + clear must-change + bump epoch in
  // einer Transaktion, damit Race-Conditions (zwei parallele Klicks aufs
  // gleiche Mail) sauber scheitern.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionEpoch: user.sessionEpoch + 1,
        },
      });
      // consumePasswordResetToken wirft, wenn schon konsumiert.
      const res = await tx.passwordResetToken.updateMany({
        where: { id: verified.tokenId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (res.count === 0) {
        throw new Error("Token bereits konsumiert.");
      }
    });
  } catch {
    return NextResponse.json({ error: "RACE" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
