import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { FindingActions } from "@/components/owner/diagnostics/FindingActions";
import { AutoRefresh } from "@/components/owner/diagnostics/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function TenantDiagnosticsDetail({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const [snap, runs, findings, secEvents, emails] = await Promise.all([
    prisma.tenantHealthSnapshot.findUnique({ where: { companyId } }),
    prisma.diagnosticRun.findMany({
      where: { companyId },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    prisma.diagnosticFinding.findMany({
      where: { companyId, status: { in: ["open", "acknowledged"] } },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
    }),
    prisma.securityEvent.findMany({
      where: { companyId },
      orderBy: { detectedAt: "desc" },
      take: 20,
    }),
    prisma.diagnosticEmailNotification.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={45} />
      <div>
        <Link
          href="/owner/diagnostics"
          className="inline-flex items-center gap-1.5 text-sm text-habb-muted hover:text-habb-ink"
        >
          <ArrowLeft className="h-4 w-4" />Back to overview</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-habb-black">
          {company.name}
        </h1>
        {snap && (
          <p className="mt-1 text-sm text-habb-muted">Status<strong className="text-habb-ink">{snap.status}</strong> ·
            Score <strong className="text-habb-ink">{snap.score}</strong> ·
            Last check{" "}
            {snap.lastCheckedAt
              ? snap.lastCheckedAt.toLocaleString("de-CH")
              : "—"}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-habb-line bg-white">
        <div className="border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-semibold text-habb-ink">
            Open Findings ({findings.length})
          </h2>
        </div>
        {findings.length === 0 ? (
          <p className="px-5 py-6 text-sm text-habb-muted">
            No open findings.
          </p>
        ) : (
          <ul className="divide-y divide-habb-line">
            {findings.map((f) => (
              <li key={f.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-habb-paper px-2 py-0.5 text-xs font-medium text-habb-ink">
                        {f.severity}
                      </span>
                      <span className="text-xs text-habb-muted">
                        {f.category} · {f.status}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-habb-ink">
                      {f.title}
                    </div>
                    <div className="mt-0.5 text-sm text-habb-muted">
                      {f.message}
                    </div>
                    {f.recommendation && (
                      <div className="mt-1 text-xs text-habb-ink">
                        <strong>Recommendation:</strong> {f.recommendation}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <FindingActions findingId={f.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Security-Events (${secEvents.length})`}>
          {secEvents.length === 0 ? (
            <Empty>No Security-Events.</Empty>
          ) : (
            secEvents.map((e) => (
              <Row
                key={e.id}
                a={`${e.eventType} · ${e.severity}`}
                b={`Risk ${e.riskScore} · ${e.detectedAt.toLocaleString("de-CH")}`}
                c={e.message}
              />
            ))
          )}
        </Panel>
        <Panel title="Recent Diagnostic Runs">
          {runs.map((r) => (
            <Row
              key={r.id}
              a={`${r.status} · ${r.triggeredBy}`}
              b={r.startedAt.toLocaleString("de-CH")}
              c={r.summary ?? ""}
            />
          ))}
        </Panel>
      </div>

      <Panel title="Email Notifications">
        {emails.length === 0 ? (
          <Empty>No emails.</Empty>
        ) : (
          emails.map((m) => (
            <Row
              key={m.id}
              a={`${m.subject}`}
              b={`${m.status} · ${m.notificationType} · ${m.createdAt.toLocaleString("de-CH")}`}
              c={m.errorMessage ?? ""}
            />
          ))
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-habb-line bg-white">
      <div className="border-b border-habb-line px-5 py-3">
        <h2 className="text-sm font-semibold text-habb-ink">{title}</h2>
      </div>
      <div className="divide-y divide-habb-line">{children}</div>
    </section>
  );
}

function Row({ a, b, c }: { a: string; b: string; c?: string }) {
  return (
    <div className="px-5 py-3">
      <div className="text-sm font-medium text-habb-ink">{a}</div>
      <div className="mt-0.5 text-xs text-habb-muted">{b}</div>
      {c ? <div className="mt-0.5 text-xs text-habb-muted">{c}</div> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-6 text-sm text-habb-muted">{children}</p>;
}
