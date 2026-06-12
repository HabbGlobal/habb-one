import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TenantAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!tenant) notFound();

  const events = await prisma.ownerAuditLog.findMany({
    where: { targetCompanyId: id },
    orderBy: { timestamp: "desc" },
    take: 100,
    select: {
      id: true,
      timestamp: true,
      action: true,
      ownerEmail: true,
      reason: true,
      ticketRef: true,
      ipAddress: true,
    },
  });

  return (
    <section className="rounded-lg border border-habb-line bg-white">
      <header className="border-b border-habb-line px-5 py-3">
        <h2 className="text-sm font-medium text-habb-ink">Owner-Actionen auf {tenant.name}</h2>
        <p className="mt-0.5 text-xs text-habb-muted">
          Letzte 100 Audit-entries. Vollständige Suche im globalen Audit Log (kommt in PR&nbsp;2.1).
        </p>
      </header>
      {events.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-habb-muted">
          Noch keine Owner-Actionen für diesen Tenanten.
        </p>
      ) : (
        <ul className="divide-y divide-habb-line">
          {events.map((e) => (
            <li key={e.id} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[170px_180px_1fr_120px] sm:gap-3 sm:items-center">
              <span className="font-mono text-xs text-habb-muted">
                {e.timestamp.toLocaleString("de-CH")}
              </span>
              <span className="text-sm font-medium text-habb-ink">{e.action}</span>
              <span className="truncate text-xs text-habb-muted">
                {e.reason ? `— ${e.reason}` : ""}
                {e.ticketRef ? ` (${e.ticketRef})` : ""}
              </span>
              <span className="text-right text-xs text-habb-muted">{e.ownerEmail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
