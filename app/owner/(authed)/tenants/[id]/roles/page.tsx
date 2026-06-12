import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  getStaticDefaults,
  loadPermissionMatrix,
  type Permission,
} from "@/lib/permissions";
import {
  CONFIGURABLE_ROLES,
  ROLE_LABELS_DE,
  ROLE_DESCRIPTIONS_DE,
  type ConfigurableRole,
} from "@/lib/roles";
import type { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Users, ChevronRight } from "lucide-react";
import { OwnerRoleMatrixEditor } from "./OwnerRoleMatrixEditor";

export const dynamic = "force-dynamic";

export default async function TenantRolesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

  // Aktuelle Matrix laden (Defaults ∪ DB-Overrides). Wichtig: HIER
  // gezielt FÜR diesen Tenanten — nicht für die laufende Owner-Session.
  const matrix = await loadPermissionMatrix(tenant.id);

  // Override-Zeilen separat laden für die "abweichend"-Markierung +
  // Header-Badge.
  const overrideRows = await prisma.rolePermission.findMany({
    where: { companyId: tenant.id },
    select: { role: true, permission: true, allowed: true },
  });

  const initialMatrix: Record<ConfigurableRole, Permission[]> = {
    ADMIN: [],
    PLANNER: [],
    EMPLOYEE: [],
  };
  for (const role of CONFIGURABLE_ROLES) {
    const allowedSet = matrix[role] ?? new Set<Permission>();
    initialMatrix[role] = ALL_PERMISSIONS.filter((p) => allowedSet.has(p));
  }

  const defaults: Record<ConfigurableRole, Permission[]> = {
    ADMIN: getStaticDefaults("ADMIN" as UserRole),
    PLANNER: getStaticDefaults("PLANNER" as UserRole),
    EMPLOYEE: getStaticDefaults("EMPLOYEE" as UserRole),
  };

  const overridesPerRole: Record<ConfigurableRole, number> = {
    ADMIN: 0,
    PLANNER: 0,
    EMPLOYEE: 0,
  };
  for (const row of overrideRows) {
    if (row.role === "ADMIN" || row.role === "PLANNER" || row.role === "EMPLOYEE") {
      overridesPerRole[row.role] += 1;
    }
  }

  // Anzahl User mit eigenen Overrides (für Hinweis-Karte).
  const usersWithOverrides = await prisma.userPermission.groupBy({
    by: ["userId"],
    where: { companyId: tenant.id },
    _count: true,
  });

  return (
    <section className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-habb-paper p-2 mt-1">
          <ShieldCheck className="h-6 w-6 text-habb-ink" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Rolen &amp; Rechte</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Lege fest, welche Role bei <strong>{tenant.name}</strong> welche
            Funktionen sehen und ausführen darf.
            {" "}
            <strong className="ml-0">Super-Admin</strong> hat immer alle Rechte
            und ist hier nicht editierbar. Änderungen wirken sofort; angemeldete
            User sehen sie nach dem nächsten Reload.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rolen-Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <li className="rounded border bg-habb-paper px-3 py-2">
              <div className="font-medium">{ROLE_LABELS_DE.SUPERADMIN}</div>
              <div className="text-muted-foreground text-xs mt-1">
                {ROLE_DESCRIPTIONS_DE.SUPERADMIN}
              </div>
            </li>
            {CONFIGURABLE_ROLES.map((r) => (
              <li key={r} className="rounded border bg-habb-paper px-3 py-2">
                <div className="font-medium flex items-center justify-between">
                  <span>{ROLE_LABELS_DE[r]}</span>
                  {overridesPerRole[r] > 0 && (
                    <span className="text-[10px] uppercase tracking-wider rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
                      angepasst
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  {ROLE_DESCRIPTIONS_DE[r]}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <OwnerRoleMatrixEditor
        tenantId={tenant.id}
        initialMatrix={initialMatrix}
        defaults={defaults}
        permissionDefs={[...PERMISSION_DEFINITIONS]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Per-User-Rechte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Einzelne User können von der Rolen-Matrix abweichen — zusätzliche
            Rechte erhalten oder welche entzogen bekommen. Verwaltung pro User
            auf der Tab <Link href={`/owner/tenants/${tenant.id}/users`} className="underline">User</Link>.
          </p>
          <div className="text-xs text-muted-foreground">
            Aktuell mit individuellen Overrides:{" "}
            <strong>{usersWithOverrides.length}</strong> User
          </div>
          <Link
            href={`/owner/tenants/${tenant.id}/users`}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
          >
            Zu den Usern
            <ChevronRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
