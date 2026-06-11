/**
 * Step-up "Sudo"-Modus für destruktive Owner-Aktionen.
 *
 * Auch nach einem frischen 2FA-Login wird vor jeder gefährlichen Mutation
 * eine erneute Passwort-Eingabe gefordert. Bei Erfolg setzt
 * `grantSudo(sessionId)` ein 5-Minuten-Fenster im `OwnerSession`-Record;
 * Routen prüfen das via `requireOwner({ sudo: true })`.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export interface SudoCheck {
  ok: boolean;
}

export async function verifyOwnerPassword(input: {
  ownerAccountId: string;
  password: string;
}): Promise<SudoCheck> {
  const account = await prisma.ownerAccount.findUnique({
    where: { id: input.ownerAccountId },
    select: { passwordHash: true, isActive: true },
  });
  // Always run bcrypt — constant-time even when the account is gone.
  const dummyHash = "$2a$12$DUMMYDUMMYDUMMYDUMMYDU.fakefakefakefakefakefakefakefakefakefaa";
  const hash = account?.passwordHash ?? dummyHash;
  const ok = await bcrypt.compare(input.password, hash);
  return { ok: Boolean(account && account.isActive && ok) };
}
