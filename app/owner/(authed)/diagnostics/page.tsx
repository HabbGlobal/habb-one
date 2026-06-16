import { prisma } from "@/lib/prisma";
import { ShieldAlert, Activity, Mail, AlertTriangle } from "lucide-react";
import { DiagnosticsCharts } from "@/components/owner/diagnostics/Charts";
import { TenantTable } from "@/components/owner/diagnostics/TenantTable";
import { TestEmailButton } from "@/components/owner/diagnostics/TestEmailButton";
import { AutoRefresh } from "@/components/owner/diagnostics/AutoRefresh";

export const dynamic = "force-dynamic";

const DAY = 24 * 3_600_000;

export default async function OwnerDiagnosticsPage() {
  const since24 = new Date(Date.now() - DAY);

  const [
    companies,
    openByCat,
    secBySev,
    secCrit24,
    emails24,
    emailsFailed24,
    recentSec,
    recentEmails,
  ] = await Promise.all([
    prisma.company.findMany({
      where: { registrationStatus: "ACTIVE", suspendedAt: null },
      select: { id: true, name: true, healthSnapshot: true },
      orderBy: { name: "asc" },
    }),
    prisma.diagnosticFinding.groupBy({
      by: ["category"],
      where: { status: { in: ["open", "acknowledged"] } },
      _count: true,
    }),
    prisma.securityEvent.groupBy({
      by: ["severity"],
      where: { detectedAt: { gte: new Date(Date.now() - 7 * DAY) } },
      _count: true,
    }),
    prisma.securityEvent.count({
      where: { severity: "critical", detectedAt: { gte: since24 } },
    }),
    prisma.diagnosticEmailNotification.count({
      where: { createdAt: { gte: since24 } },
    }),
    prisma.diagnosticEmailNotification.count({
      where: { status: "failed", createdAt: { gte: since24 } },
    }),
    prisma.securityEvent.findMany({
      orderBy: { detectedAt: "desc" },
      take: 15,
      include: { company: { select: { name: true } } },
    }),
    prisma.diagnosticEmailNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { company: { select: { name: true } } },
    }),
  ]);

  // Immer ALLE aktiven Tenanten anzeigen — Snapshot optional. Ohne
  // bisherigen Lauf: Status "unknown / noch nie geprüft", aber Zeile
  // (mit "Check") ist da → kein Henne-Ei-Problem vor dem ersten Cron.
  const byStatus = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  let scoreSum = 0;
  let scored = 0;
  let openTotal = 0;
  for (const c of companies) {
    const s = c.healthSnapshot;
    const status = (s?.status ?? "unknown") as keyof typeof byStatus;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (s) {
      scoreSum += s.score;
      scored++;
      openTotal += s.openFindingsCount;
    }
  }
  const avgScore = scored ? Math.round(scoreSum / scored) : 0;

  const tenants = companies
    .map((c) => {
      const s = c.healthSnapshot;
      return {
        companyId: c.id,
        name: c.name,
        status: s?.status ?? "unknown",
        score: s?.score ?? 0,
        lastCheckedAt: s?.lastCheckedAt?.toISOString() ?? null,
        critical: s?.criticalFindingsCount ?? 0,
        warning: s?.warningFindingsCount ?? 0,
        open: s?.openFindingsCount ?? 0,
        security: s?.securityEventsCount ?? 0,
        avgResponseMs: s?.avgResponseMs ?? null,
      };
    })
    .sort((a, b) => a.score - b.score);

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={45} />
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">
            Platform · Operations
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
            Diagnostics &amp; Security-Monitoring
          </h1>
          <p className="mt-1 text-sm text-habb-muted">
            Hourly automated checks for all tenants · rule-based, without
            external AI.
          </p>
        </div>
        <TestEmailButton />
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Tenants" value={companies.length} />
        <Kpi label="Healthy" value={byStatus.healthy} tone="success" />
        <Kpi label="Warning" value={byStatus.warning} tone="warning" />
        <Kpi label="Critical" value={byStatus.critical} tone="danger" />
        <Kpi label="Unknown" value={byStatus.unknown} />
        <Kpi
          label="Critical security (24h)"
          value={secCrit24}
          tone={secCrit24 > 0 ? "danger" : undefined}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <Kpi label="Open findings" value={openTotal} />
        <Kpi label="Avg. health score" value={avgScore} />
        <Kpi
          label="Emails (24h)"
          value={emails24}
          icon={<Mail className="h-4 w-4" />}
        />
        <Kpi
          label="Email failures (24h)"
          value={emailsFailed24}
          tone={emailsFailed24 > 0 ? "danger" : undefined}
        />
      </div>

      <DiagnosticsCharts
        statusDistribution={byStatus}
        findingsByCategory={openByCat.map((c) => ({
          category: c.category,
          count: c._count,
        }))}
        securityBySeverity={secBySev.map((s) => ({
          severity: s.severity,
          count: s._count,
        }))}
      />

      {/* Tenant Health Table */}
      <section className="rounded-xl border border-habb-line bg-white">
        <div className="border-b border-habb-line px-5 py-3">
          <h2 className="text-sm font-semibold text-habb-ink">
            Tenant Health
          </h2>
        </div>
        <TenantTable tenants={tenants} />
      </section>

      {/* Security + email view */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ListCard
          title="Security events (latest)"
          icon={<AlertTriangle className="h-4 w-4 text-habb-red" />}
          empty="No security events."
          rows={recentSec.map((e) => ({
            key: e.id,
            primary: `${e.eventType} · ${e.severity}`,
            secondary: `${e.company?.name ?? "Platform"} · Risk ${e.riskScore} · ${e.detectedAt.toLocaleString("de-CH")}`,
          }))}
        />
        <ListCard
          title="Email notifications (latest)"
          icon={<Mail className="h-4 w-4 text-habb-muted" />}
          empty="No emails."
          rows={recentEmails.map((m) => ({
            key: m.id,
            primary: `${m.subject}`,
            secondary: `${m.status} · ${m.notificationType} · ${m.company?.name ?? "—"} · ${m.createdAt.toLocaleString("de-CH")}`,
          }))}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger";
  icon?: React.ReactNode;
}) {
  const color =
    tone === "danger"
      ? "text-habb-red"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "success"
          ? "text-habb-success"
          : "text-habb-black";
  return (
    <div className="rounded-xl border border-habb-line bg-white px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-habb-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

function ListCard({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { key: string; primary: string; secondary: string }[];
  empty: string;
}) {
  return (
    <section className="rounded-xl border border-habb-line bg-white">
      <div className="flex items-center gap-2 border-b border-habb-line px-5 py-3">
        {icon}
        <h2 className="text-sm font-semibold text-habb-ink">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-habb-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-habb-line">
          {rows.map((r) => (
            <li key={r.key} className="px-5 py-3">
              <div className="text-sm font-medium text-habb-ink">
                {r.primary}
              </div>
              <div className="mt-0.5 text-xs text-habb-muted">
                {r.secondary}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
