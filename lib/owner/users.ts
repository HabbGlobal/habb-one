import { randomBytes } from "crypto";

/**
 * Erzeugt ein 16-stelliges Wegwerf-Passwort, das der Owner dem User
 * persönlich mitteilt. Charset bewusst ohne `0`/`O`/`I`/`l` und ohne
 * URL-Sonderzeichen — verbal/per Chat reibungslos durchgebbar.
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

/** Rollen, die der Owner setzen darf. SUPERADMIN bewusst nicht — das ist
 *  der Master-Account jedes Mandanten und kann nur via SQL / Bootstrap-Skript
 *  vergeben werden. */
export const OWNER_ASSIGNABLE_ROLES: UserRole[] = [
  "ADMIN",
  "PLANNER",
  "EMPLOYEE",
  "KIOSK_OPERATOR",
];

export function isOwnerAssignableRole(r: string): r is UserRole {
  return (OWNER_ASSIGNABLE_ROLES as string[]).includes(r);
}
