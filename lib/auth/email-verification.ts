/**
 * E-Mail-Verifizierungs-Token. Wird beim Self-Registration ausgelöst;
 * der Klartext-Token lebt ausschliesslich in der Mail und in der URL, die
 * der User anklickt. DB-Persistenz: nur bcrypt-Hash. TTL 24h, Single-Use.
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

export interface IssuedEmailVerificationToken {
  token: string;
  id: string;
  expiresAt: Date;
}

export async function issueEmailVerificationToken(input: {
  userId: string;
  ttlSeconds?: number;
}): Promise<IssuedEmailVerificationToken> {
  // Vorherige offene Tokens invalidieren, damit eine erneute Anforderung
  // den alten Link tot macht.
  await prisma.emailVerificationToken.updateMany({
    where: { userId: input.userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = await bcrypt.hash(token, 12);
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000);

  const row = await prisma.emailVerificationToken.create({
    data: { userId: input.userId, tokenHash, expiresAt },
    select: { id: true, expiresAt: true },
  });

  return { token, id: row.id, expiresAt: row.expiresAt };
}

export interface VerifiedEmailToken {
  tokenId: string;
  userId: string;
}

export async function verifyEmailVerificationToken(
  token: string,
): Promise<VerifiedEmailToken | null> {
  if (!token || token.length < 16) return null;

  const candidates = await prisma.emailVerificationToken.findMany({
    where: { consumedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true, tokenHash: true },
  });

  for (const c of candidates) {
    const ok = await bcrypt.compare(token, c.tokenHash);
    if (ok) return { tokenId: c.id, userId: c.userId };
  }
  return null;
}
