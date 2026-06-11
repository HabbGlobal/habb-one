import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  PERMISSION_DEFINITIONS,
  loadPermissionMatrix,
  type Permission,
} from "@/lib/permissions";
import { effectiveRole, roleLabelDe, isSuperAdmin } from "@/lib/roles";
import { OwnerUserPermissionsEditor } from "./OwnerUserPermissionsEditor";

export const dynamic = "force-dynamic";

export default async function OwnerUserPermissionsPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id: tenantId, userId } = await params;

  const tenant = await prisma.company.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) notFound();

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
  if (!user || user.companyId !== tenantId) notFound();

  // Effektive Permissions der Rolle (Default + Tenant-Override)
  const matrix = await loadPermissionMatrix(tenantId);
  const eff = effectiveRole(user.role);
  const rolePermissions = new Set<Permission>(matrix[eff] ?? []);

  // Bestehende Per-User-Overrides laden
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
          href={`/owner/tenants/${tenantId}/users`}
          className="inline-flex items-center gap-1 text-xs text-habb-muted hover:text-habb-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          User-Liste
        </Link>
        <h2 className="mt-2 text-lg font-semibold">
          Persönliche Rechte — {user.name || user.email}
        </h2>
        <p className="text-xs text-habb-muted mt-0.5">
          {user.email} · Rolle: <strong>{roleLabelDe(user.role)}</strong> ·
          Mandant: <strong>{tenant.name}</strong>
          {user.deletedAt && (
            <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
              gelöscht
            </span>
          )}
        </p>
      </div>

      {isSuper ? (
        <div className="rounded-lg border border-habb-line bg-habb-paper px-4 py-3 text-sm text-habb-ink">
          <strong>SUPERADMIN</strong> hat per Design immer alle Rechte —
          Per-User-Overrides sind hier nicht zulässig. Wenn du Rechte
          einschränken willst, ändere bitte zuerst die Rolle des Users.
        </div>
      ) : user.deletedAt ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Dieser User ist gelöscht — Rechte werden nicht mehr verwendet.
        </div>
      ) : (
        <OwnerUserPermissionsEditor
          tenantId={tenantId}
          userId={user.id}
          initialOverrides={initialOverrides}
          rolePermissions={rolePermissions}
          permissionDefs={[...PERMISSION_DEFINITIONS]}
          userLabel={user.name || user.email}
          roleLabel={roleLabelDe(user.role)}
        />
      )}
    </section>
  );
}
