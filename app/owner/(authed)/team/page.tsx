import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOwnerContext } from "@/lib/owner/auth";
import { OwnerTeamActions } from "@/components/owner/OwnerTeamActions";
import { CreateOwnerButton } from "@/components/owner/CreateOwnerButton";
import { ShieldCheck, ShieldOff, KeySquare } from "lucide-react";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  OWNER_ROOT: "Root (Full access)",
  OWNER_ADMIN: "Admin",
  OWNER_SUPPORT: "Support",
};

const ROLE_BADGE: Record<string, string> = {
  OWNER_ROOT: "bg-habb-red/10 text-habb-red-dark",
  OWNER_ADMIN: "bg-habb-ink/10 text-habb-ink",
  OWNER_SUPPORT: "bg-habb-paper text-habb-muted",
};

export default async function OwnerTeamPage() {
  const ctx = await getOwnerContext();
  // OWNER_ROOT-only page: other roles are redirected to the dashboard.
  // The sidebar already hides the link.
  if (!ctx) redirect("/owner/login");
  if (ctx.role !== "OWNER_ROOT") redirect("/owner");

  const owners = await prisma.ownerAccount.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      webauthnEnrolledAt: true,
      createdAt: true,
      _count: { select: { webauthnCredentials: true } },
    },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Platform</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
            Owner Team
          </h1>
          <p className="mt-1 text-sm text-habb-muted">
            {owners.filter((o) => o.isActive).length} active owner accounts ·{" "}
            {owners.filter((o) => !o.isActive).length} deactivated
          </p>
        </div>
        <CreateOwnerButton />
      </header>

      <div className="overflow-hidden rounded-lg border border-habb-line bg-white">
        <table className="min-w-full divide-y divide-habb-line text-sm">
          <thead className="bg-habb-paper text-left text-xs font-medium uppercase tracking-wide text-habb-muted">
            <tr>
              <th className="px-5 py-3">Name / Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Passkey</th>
              <th className="px-5 py-3">Last Login</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-habb-line">
            {owners.map((o) => {
              const isSelf = o.id === ctx.ownerAccountId;
              return (
                <tr key={o.id} className={o.isActive ? "" : "bg-habb-paper/40"}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-habb-ink">
                      {o.name}
                      {isSelf && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-habb-muted">
                          (You)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-habb-muted">{o.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        ROLE_BADGE[o.role] ?? "bg-habb-paper text-habb-muted"
                      }`}
                    >
                      {ROLE_LABEL[o.role] ?? o.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {o.isActive ? (
                      <span className="inline-flex items-center gap-1 text-habb-success text-xs">
                        <ShieldCheck className="h-3.5 w-3.5" />Active</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-habb-muted text-xs">
                        <ShieldOff className="h-3.5 w-3.5" /> Deactivated
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-habb-muted">
                    {o.webauthnEnrolledAt ? (
                      <span className="inline-flex items-center gap-1">
                        <KeySquare className="h-3 w-3" />
                        {o._count.webauthnCredentials}{" "}
                        {o._count.webauthnCredentials === 1 ? "key" : "keys"}
                      </span>
                    ) : (
                      <span className="text-habb-warning">not yet registered</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-habb-muted">
                    {o.lastLoginAt
                      ? o.lastLoginAt.toLocaleString("de-CH")
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isSelf ? (
                      <span className="text-xs text-habb-muted">
                        Own actions under &bdquo;My Profile&ldquo;
                      </span>
                    ) : (
                      <OwnerTeamActions
                        owner={{
                          id: o.id,
                          email: o.email,
                          name: o.name,
                          role: o.role,
                          isActive: o.isActive,
                          hasPasskeys: o._count.webauthnCredentials > 0,
                        }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-habb-muted">
        Owner account management is exclusively allowed for OWNER_ROOT. Every
        action (create, role change, deactivate, 2FA reset)
        requires sudo + reason and is logged in the audit log.
      </p>
    </div>
  );
}
