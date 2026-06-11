/**
 * Einheitliche Auflösung "welcher Mandant betreibt dieses Kiosk-Tablet?".
 *
 * Drei Quellen, in Prioritätsreihenfolge:
 *   1. Account-Session: ist ein KIOSK_OPERATOR via NextAuth eingeloggt,
 *      kommt die Firma aus dem User-Profil (Lock-Screen entfällt).
 *   2. Kiosk-Lock-Cookie: anonymes Tablet, morgens via Kiosk-Passwort
 *      auf eine Firma freigeschaltet.
 *   3. Single-Company-Fallback: existiert genau EINE Firma (klassisches
 *      Single-Tenant-Setup vor Multi-Tenant), nimm die.
 *
 * Vor dem Security-Refactor lag diese Logik nur in /kiosk/page.tsx; die
 * Actions-Seite verlangte fälschlich HART das Lock-Cookie und schickte
 * Account-/Single-Tenant-Kioske nach PIN-Eingabe zurück auf die Kachel-
 * Liste ("passiert nichts"). Jetzt teilen sich beide Seiten diese Quelle.
 */

import { auth } from "@/lib/auth";
import { isKioskOperator } from "@/lib/roles";
import { readKioskLock } from "@/lib/kiosk-lock";
import { prisma } from "@/lib/prisma";

export interface KioskCompanyResolution {
  /** Firma aus Account-Session ODER Lock-Cookie (für Lock-Screen-Logik). */
  lockedCompanyId: string | null;
  /** Endgültige Firma inkl. Single-Company-Fallback. null = unklar. */
  effectiveCompanyId: string | null;
}

export async function resolveKioskCompany(): Promise<KioskCompanyResolution> {
  const session = await auth();
  const accountCompanyId =
    session?.user && isKioskOperator(session.user.role)
      ? session.user.companyId
      : null;

  const lockedCompanyId = accountCompanyId ?? (await readKioskLock());

  let effectiveCompanyId: string | null = lockedCompanyId;
  if (!effectiveCompanyId) {
    const all = await prisma.company.findMany({ select: { id: true }, take: 2 });
    effectiveCompanyId = all.length === 1 ? all[0].id : null;
  }

  return { lockedCompanyId, effectiveCompanyId };
}
