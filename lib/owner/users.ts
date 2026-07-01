import { randomBytes } from "crypto";

/**
 * Generates a 16-character disposable password that the owner passes to the
 * user personally. Charset intentionally excludes `0`/`O`/`I`/`l` and URL
 * special characters, making it easy to pass verbally or by chat.
 */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

import type { UserRole } from "@prisma/client";

/** Roles the owner may assign. SUPERADMIN is intentionally excluded; it is the
 *  master account of each tenant and can only be granted through SQL or the
 *  bootstrap script. */
export const OWNER_ASSIGNABLE_ROLES: UserRole[] = [
  "ADMIN",
  "PLANNER",
  "EMPLOYEE",
  "KIOSK_OPERATOR",
];

export function isOwnerAssignableRole(r: string): r is UserRole {
  return (OWNER_ASSIGNABLE_ROLES as string[]).includes(r);
}
