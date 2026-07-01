/**
 * Step-up "sudo" mode for destructive owner actions.
 *
 * Even after a fresh 2FA login, dangerous mutations require another password
 * entry. On success, `grantSudo(sessionId)` sets a 5-minute window in the
 * `OwnerSession` record; routes check that with `requireOwner({ sudo: true })`.
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
