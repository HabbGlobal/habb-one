/**
 * Magic-Link Passwort-Reset für Tenant-User.
 *
 * Klartext-Token landet ausschliesslich in der Mail und in der URL, die der
 * User anklickt. In der DB liegt nur ein bcrypt-Hash. Der Token läuft nach
 * 60 Min ab und ist Single-Use (`consumedAt` wird transaktional gesetzt).
 */

import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32;
const DEFAULT_TTL_SECONDS = 60 * 60;

export interface IssuedResetToken {
  /** Klartext-Token — nur zurück an den Aufrufer und in die Mail. */
  token: string;
  /** Persistierter Row-Identifier. Audit-Hilfe. */
  id: string;
  expiresAt: Date;
}

export async function issuePasswordResetToken(input: {
  userId: string;
  initiatedByOwnerAccountId: string | null;
  ttlSeconds?: number;
}): Promise<IssuedResetToken> {
  // Mehrere aktive Tokens parallel sind im DB-Schema erlaubt, aber für die
  // Owner-getriggerte Variante invalidieren wir bestehende — verhindert
  // dass ein versehentlich zweimal ausgelöster Reset zwei Mails mit gültigen
  // Links produziert.
  await prisma.passwordResetToken.updateMany({
    where: { userId: input.userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = await bcrypt.hash(token, 12);
  const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000);

  const row = await prisma.passwordResetToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      expiresAt,
      initiatedByOwnerAccountId: input.initiatedByOwnerAccountId,
    },
    select: { id: true, expiresAt: true },
  });

  return { token, id: row.id, expiresAt: row.expiresAt };
}

export interface VerifiedReset {
  tokenId: string;
  userId: string;
}

/**
 * Vergleicht den Klartext-Token gegen alle aktiven Hashes — bcrypt-Hashes
 * sind nicht direkt lookupbar. Bei den erwartet niedrigen Volumina (max.
 * eine Handvoll aktive Tokens auf einmal) ist linear-scan akzeptabel.
 */
export async function verifyPasswordResetToken(token: string): Promise<VerifiedReset | null> {
  if (!token || token.length < 16) return null;

  const candidates = await prisma.passwordResetToken.findMany({
    where: {
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, userId: true, tokenHash: true },
  });

  for (const c of candidates) {
    const ok = await bcrypt.compare(token, c.tokenHash);
    if (ok) {
      return { tokenId: c.id, userId: c.userId };
    }
  }
  return null;
}

/**
 * Atomisch konsumieren: ein zweites Mal denselben Token zu verwenden
 * scheitert. Wirft, wenn der Token bereits konsumiert wurde — bedeutet
 * Race-Condition zwischen zwei parallelen Reset-Versuchen.
 */
export async function consumePasswordResetToken(tokenId: string): Promise<void> {
  const res = await prisma.passwordResetToken.updateMany({
    where: { id: tokenId, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (res.count === 0) {
    throw new Error("Reset-Token wurde bereits verwendet oder ist abgelaufen.");
  }
}
