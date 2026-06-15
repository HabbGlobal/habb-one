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
  let logoUrl: string | null = "/brand/habb-logo.png";
  let enabledModules: string[] = [];

  if (session?.user) {
    userRoleLabel = roleLabelDe(session.user.role);

    try {
      enabledModules = Array.from(await getEnabledModules(session.user.companyId));
    } catch {
      // Sidebar shows less in doubt — route guard remains authoritative.
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

    // Company name + logo URL for the sidebar. We only fetch the
    // metadata (logoData is omitted), the bytes are served by
    // /api/company/logo directly.
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
      // Sidebar falls back to the default translation string
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
      {/* Main: 256px sidebar on left (md+), above or below mobile header (16px higher) */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0">
        {/* Banner is no-op when no impersonation is active */}
        <ImpersonationBanner />
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">{children}</div>
      </main>
    </div>
  );
}
