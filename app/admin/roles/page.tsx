import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
  isSuperAdmin,
  type ConfigurableRole,
} from "@/lib/roles";
import type { UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Users, ChevronRight } from "lucide-react";
import Link from "next/link";
import { RoleMatrixEditor } from "./RoleMatrixEditor";
import { roleLabelDe } from "@/lib/roles";

export default async function RolesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Strikt: Nur SUPERADMIN.
  if (!isSuperAdmin(session.user.role)) redirect("/admin");

  const companyId = session.user.companyId;

  // 1) Aktuelle Matrix laden (Defaults ∪ DB-Overrides).
  const matrix = await loadPermissionMatrix(companyId);

  // 2) Override-Zeilen separat laden, damit die UI "abweichend vom Default"
  //    markieren kann.
  const overrideRows = await prisma.rolePermission.findMany({
    where: { companyId },
    select: { role: true, permission: true, allowed: true, updatedAt: true },
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

  // Defaults pro Rolle, damit das UI "abweichend" markieren kann.
  const defaults: Record<ConfigurableRole, Permission[]> = {
    ADMIN: getStaticDefaults("ADMIN" as UserRole),
    PLANNER: getStaticDefaults("PLANNER" as UserRole),
    EMPLOYEE: getStaticDefaults("EMPLOYEE" as UserRole),
  };

  // Override-Count pro Rolle für die Header-Badge.
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

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-habb-paper p-2 mt-1">
          <ShieldCheck className="h-6 w-6 text-habb-ink" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Rollen &amp; Rechte</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Lege fest, welche Rolle welche Funktionen sehen und ausführen darf.
            <strong className="ml-1">Super-Admin</strong> hat immer alle Rechte
            und ist hier nicht editierbar. Änderungen wirken sofort auf das UI;
            angemeldete User sehen sie nach dem nächsten Neuladen.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rollen-Übersicht</CardTitle>
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

      <RoleMatrixEditor
        initialMatrix={initialMatrix}
        defaults={defaults}
        permissionDefs={[...PERMISSION_DEFINITIONS]}
      />

      <PerUserOverridesSection companyId={companyId} />
    </div>
  );
}

async function PerUserOverridesSection({ companyId }: { companyId: string }) {
  const users = await prisma.user.findMany({
    where: { companyId, deletedAt: null, role: { not: "SUPERADMIN" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  const overrideCounts = await prisma.userPermission.groupBy({
    by: ["userId"],
    where: { companyId },
    _count: true,
  });
  const byUser = new Map<string, number>();
  for (const r of overrideCounts) byUser.set(r.userId, r._count);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Persönliche Rechte pro User
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Einzelne User können von ihrer Rolle abweichen — Rechte
          <strong> zusätzlich </strong>bekommen oder <strong>entzogen</strong>
          {" "}werden. <strong>Super-Admin</strong> behält per Design immer alle
          Rechte und ist hier ausgeschlossen.
        </p>
        {users.length === 0 ? (
          <div className="rounded-md border bg-habb-paper px-3 py-2 text-sm text-muted-foreground">
            Keine konfigurierbaren User vorhanden.
          </div>
        ) : (
          <ul className="divide-y divide-habb-line rounded-md border">
            {users.map((u) => {
              const cnt = byUser.get(u.id) ?? 0;
              return (
                <li key={u.id}>
                  <Link
                    href={`/admin/roles/users/${u.id}`}
                    className="flex items-center justify-between px-3 py-2 hover:bg-habb-paper text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {u.name || u.email}
                        {cnt > 0 && (
                          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-100 px-2 text-[10px] font-medium text-amber-900">
                            {cnt} Override{cnt === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.email} · {roleLabelDe(u.role)}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
