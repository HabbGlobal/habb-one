/**
 * Server-Guard für Admin-Sektions-Layouts. Sperrt die ganze Route-
 * Gruppe, wenn das Modul nicht im Plan des Mandanten ist.
 *
 * Getrennt von `modules.ts`, damit Skripte/Shells die reine Plan-Logik
 * importieren können, ohne NextAuth/next-navigation mitzuladen.
 */

import { redirect } from "next/navigation";
import type { TenantModule } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getEnabledModules } from "@/lib/entitlements/modules";

export async function requireModule(module: TenantModule): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const enabled = await getEnabledModules(session.user.companyId);
  if (!enabled.has(module)) {
    redirect(`/admin/upgrade?m=${module}`);
  }
}
