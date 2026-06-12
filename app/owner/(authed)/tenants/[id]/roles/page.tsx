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

  // Load current matrix (Defaults ∪ DB overrides). Important: HERE
  // specifically FOR this tenant — not for the running owner session.
  const matrix = await loadPermissionMatrix(tenant.id);

  // Load override rows separately for the "deviating" marker +
  // header badge.
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

  // Number of users with their own overrides (for info card).
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
          <h2 className="text-lg font-semibold">Roles &amp; Permissions</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Define which role at <strong>{tenant.name}</strong> can see and
            execute which functions.
            {" "}
            <strong className="ml-0">Super Admin</strong> always has all permissions
            and is not editable here. Changes take effect immediately; logged-in
            users see them after the next reload.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles Overview</CardTitle>
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
                      customized
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
            <Users className="h-4 w-4" /> Per-User Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Individual users can deviate from the role matrix — receive additional
            permissions or have some revoked. Management per user
            on the <Link href={`/owner/tenants/${tenant.id}/users`} className="underline">User</Link> tab.
          </p>
          <div className="text-xs text-muted-foreground">
            Currently with individual overrides:{" "}
            <strong>{usersWithOverrides.length}</strong> users
          </div>
          <Link
            href={`/owner/tenants/${tenant.id}/users`}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
          >
            Go to users
            <ChevronRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
