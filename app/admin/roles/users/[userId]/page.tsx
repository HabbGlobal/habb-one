import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PERMISSION_DEFINITIONS,
  loadPermissionMatrix,
  type Permission,
} from "@/lib/permissions";
import { effectiveRole, isSuperAdmin, roleLabel } from "@/lib/roles";
import { TenantUserPermissionsEditor } from "./TenantUserPermissionsEditor";

export const dynamic = "force-dynamic";

export default async function TenantUserPermissionsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isSuperAdmin(session.user.role)) redirect("/admin");

  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      deletedAt: true,
    },
  });
  if (!user || user.companyId !== session.user.companyId) notFound();

  const matrix = await loadPermissionMatrix(user.companyId);
  const eff = effectiveRole(user.role);
  const rolePermissions = new Set<Permission>(matrix[eff] ?? []);

  const existing = await prisma.userPermission.findMany({
    where: { userId: user.id },
    select: { permission: true, allowed: true },
  });
  const initialOverrides: Partial<Record<Permission, "grant" | "deny">> = {};
  for (const o of existing) {
    initialOverrides[o.permission as Permission] = o.allowed ? "grant" : "deny";
  }

  const isSuper = isSuperAdmin(user.role);

  return (
    <section className="space-y-6">
      <div>
        <Link
          href="/admin/roles"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Rollen &amp; Rechte
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          Personal Permissions — {user.name || user.email}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {user.email} · Role: <strong>{roleLabel(user.role)}</strong>
        </p>
      </div>

      {isSuper ? (
        <div className="rounded-lg border bg-habb-paper px-4 py-3 text-sm">
          <strong>SUPERADMIN</strong> by design always has all permissions —
          per-user overrides are not allowed here. If you want to restrict
          permissions, please first change the user&apos;s role.
        </div>
      ) : user.deletedAt ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This user is deleted — permissions are no longer used.
        </div>
      ) : (
        <TenantUserPermissionsEditor
          userId={user.id}
          initialOverrides={initialOverrides}
          rolePermissions={rolePermissions}
          permissionDefs={[...PERMISSION_DEFINITIONS]}
          userLabel={user.name || user.email}
          roleLabel={roleLabel(user.role)}
        />
      )}
    </section>
  );
}
