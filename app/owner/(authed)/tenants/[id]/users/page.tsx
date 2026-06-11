import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { UserActionsMenu, ROLE_LABEL } from "@/components/owner/UserActions";
import { CreateUserButton } from "@/components/owner/CreateUserButton";
import { ImpersonateButton } from "@/components/owner/ImpersonateButton";
import { isSuperAdmin } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function TenantUsersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!tenant) notFound();

  const users = await prisma.user.findMany({
    where: { companyId: id },
    orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lockedAt: true,
      lockedReason: true,
      mustChangePassword: true,
      deletedAt: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  // Pro User die Anzahl Per-User-Overrides (für Badge).
  const overrideCounts = await prisma.userPermission.groupBy({
    by: ["userId"],
    where: { companyId: id },
    _count: true,
  });
  const overridesByUser = new Map<string, number>();
  for (const r of overrideCounts) {
    overridesByUser.set(r.userId, r._count);
  }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-habb-ink">User von {tenant.name}</h2>
          <p className="mt-0.5 text-xs text-habb-muted">
            {users.length} Account{users.length === 1 ? "" : "s"} insgesamt
            {users.some((u) => u.deletedAt) ? " (inkl. gelöscht)" : ""}
          </p>
        </div>
        <CreateUserButton tenantId={tenant.id} tenantName={tenant.name} />
      </header>

      <div className="overflow-hidden rounded-lg border border-habb-line bg-white">
        <table className="min-w-full divide-y divide-habb-line text-sm">
          <thead className="bg-habb-paper text-left text-xs font-medium uppercase tracking-wide text-habb-muted">
            <tr>
              <th scope="col" className="px-5 py-3">Name</th>
              <th scope="col" className="px-5 py-3">E-Mail</th>
              <th scope="col" className="px-5 py-3">Rolle</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3">Letzter Login</th>
              <th scope="col" className="px-5 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-habb-line">
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-habb-muted">
                  Keine User in diesem Mandanten.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr
                key={u.id}
                className={u.deletedAt ? "bg-habb-paper/40 text-habb-muted" : "hover:bg-habb-paper/60"}
              >
                <td className="px-5 py-3 text-habb-ink">
                  <span className={u.deletedAt ? "line-through" : ""}>{u.name}</span>
                  {u.mustChangePassword && !u.deletedAt && (
                    <span className="ml-2 inline-flex rounded-full border border-habb-warning/30 bg-habb-warning/5 px-1.5 text-[10px] uppercase tracking-wide text-habb-warning">
                      muss ändern
                    </span>
                  )}
                </td>
                <td className="px-5 py-3">{u.email}</td>
                <td className="px-5 py-3">{ROLE_LABEL[u.role]}</td>
                <td className="px-5 py-3">
                  {u.deletedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-habb-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-habb-muted" />
                      Gelöscht
                    </span>
                  ) : u.lockedAt ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-habb-red"
                      title={u.lockedReason ?? ""}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-habb-red" />
                      Gesperrt
                    </span>
                  ) : u.isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-habb-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-habb-success" />
                      Aktiv
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-habb-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-habb-muted" />
                      Inaktiv
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-habb-muted">
                  {u.lastLoginAt ? u.lastLoginAt.toLocaleDateString("de-CH") : "—"}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex items-center gap-2">
                    {!u.deletedAt && !isSuperAdmin(u.role) && (
                      <Link
                        href={`/owner/tenants/${tenant.id}/users/${u.id}/permissions`}
                        className="inline-flex items-center gap-1 rounded-md border border-habb-line bg-white px-2 py-1 text-xs font-medium text-habb-ink hover:bg-habb-paper"
                        title="Persönliche Rechte für diesen User"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        Rechte
                        {(overridesByUser.get(u.id) ?? 0) > 0 && (
                          <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-900">
                            {overridesByUser.get(u.id)}
                          </span>
                        )}
                      </Link>
                    )}
                    {!u.deletedAt && !u.lockedAt && u.isActive && (
                      <ImpersonateButton
                        user={{ id: u.id, email: u.email, name: u.name }}
                      />
                    )}
                    <UserActionsMenu
                      user={{
                        id: u.id,
                        email: u.email,
                        name: u.name,
                        role: u.role,
                        isActive: u.isActive,
                        lockedAt: u.lockedAt,
                        deletedAt: u.deletedAt,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
