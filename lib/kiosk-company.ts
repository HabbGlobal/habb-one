/**
 * Centralized resolution of which tenant operates this kiosk tablet.
 *
 * Three sources, in priority order:
 *   1. Account session: when a KIOSK_OPERATOR is signed in through NextAuth,
 *      use the company from the user profile and skip the lock screen.
 *   2. Kiosk lock cookie: an anonymous tablet unlocked for a specific company
 *      with the kiosk password.
 *   3. Single-company fallback: when exactly one company exists, use it.
 *
 * Before the security refactor, this logic existed only in /kiosk/page.tsx.
 * The actions page incorrectly required a lock cookie and sent account-based
 * and single-tenant kiosks back to the employee list after PIN entry. Both
 * pages now use this shared resolver.
 */

import { auth } from "@/lib/auth";
import { isKioskOperator } from "@/lib/roles";
import { readKioskLock } from "@/lib/kiosk-lock";
import { prisma } from "@/lib/prisma";

export interface KioskCompanyResolution {
  /** Company from the account session or lock cookie, used by lock-screen logic. */
  lockedCompanyId: string | null;
  /** Final company including the single-company fallback; null means unresolved. */
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
