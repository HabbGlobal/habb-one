import { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminSidebar } from "./AdminSidebar";
import { ImpersonationBanner } from "./ImpersonationBanner";
import {
  ALL_PERMISSIONS,
  loadPermissionMatrix,
  effectivePermissionsForRole,
} from "@/lib/permissions";
import { roleLabelDe, isSuperAdmin, effectiveRole } from "@/lib/roles";
import { getEnabledModules } from "@/lib/entitlements/modules";

export async function AdminShell({ children }: { children: ReactNode }) {
  const tApp = await getTranslations("app");
  const session = await auth();

  // Permissions des aktuellen Users berechnen, damit die Sidebar korrekt
  // gefiltert anzeigen kann. SUPERADMIN bekommt immer alle Rechte.
  let userPermissions: string[] = [];
  let userRoleLabel: string | null = null;
  let companyName: string | null = null;
  let logoUrl: string | null = null;
  let enabledModules: string[] = [];

  if (session?.user) {
    userRoleLabel = roleLabelDe(session.user.role);

    try {
      enabledModules = Array.from(await getEnabledModules(session.user.companyId));
    } catch {
      // Sidebar zeigt im Zweifel weniger — Route-Guard bleibt maßgeblich.
      enabledModules = [];
    }

    if (isSuperAdmin(session.user.role)) {
      userPermissions = [...ALL_PERMISSIONS];
    } else {
      try {
        const matrix = await loadPermissionMatrix(session.user.companyId);
        const set = matrix[effectiveRole(session.user.role)] ?? new Set<string>();
        userPermissions = Array.from(set);
      } catch {
        // Fallback: statische Defaults aus dem Cache/Code
        userPermissions = Array.from(effectivePermissionsForRole(session.user.role));
      }
    }

    // Firmen-Name + Logo-URL für die Sidebar laden. Wir holen NUR die
    // Metadaten (logoData wird ausgespart), die Bytes liefert
    // /api/company/logo direkt.
    try {
      const company = await prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: { name: true, logoMimeType: true, updatedAt: true },
      });
      if (company) {
        companyName = company.name;
        if (company.logoMimeType) {
          logoUrl = `/api/company/logo?v=${company.updatedAt.getTime()}`;
        }
      }
    } catch {
      // Sidebar fällt zurück auf den Default-Translation-String
    }
  }

  return (
    <div className="min-h-screen bg-habb-paper text-habb-ink flex">
      <AdminSidebar
        companyLabel={companyName ?? tApp("company")}
        appName={tApp("name")}
        logoUrl={logoUrl}
        userName={session?.user?.name ?? null}
        userRole={session?.user?.role ?? null}
        userRoleLabel={userRoleLabel}
        permissions={userPermissions}
        enabledModules={enabledModules}
      />
      {/* Main: links 256px Sidebar (md+), darüber bzw. darunter mobile-header (16px höher) */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0">
        {/* Banner ist no-op wenn keine Impersonation läuft */}
        <ImpersonationBanner />
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
