"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  healthy: "#15803D",
  warning: "#B45309",
  critical: "#DA0E15",
  unknown: "#9CA3AF",
};
const SEV_COLORS: Record<string, string> = {
  info: "#9CA3AF",
  low: "#0EA5E9",
  medium: "#B45309",
  high: "#EA580C",
  critical: "#DA0E15",
};

export function DiagnosticsCharts({
  statusDistribution,
  findingsByCategory,
  securityBySeverity,
}: {
  statusDistribution: Record<string, number>;
  findingsByCategory: { category: string; count: number }[];
  securityBySeverity: { severity: string; count: number }[];
}) {
  const statusData = Object.entries(statusDistribution)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Tenantenstatus">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={statusData}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {statusData.map((d) => (
                <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? "#9CA3AF"} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Offene Findings nach Kategorie">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={findingsByCategory}>
            <XAxis dataKey="category" hide />
            <YAxis allowDecimals={false} width={24} />
            <Tooltip />
            <Bar dataKey="count" fill="#0A0A0A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Security-Events (7 Tage) nach Severity">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={securityBySeverity}>
            <XAxis dataKey="severity" />
            <YAxis allowDecimals={false} width={24} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {securityBySeverity.map((d) => (
                <Cell key={d.severity} fill={SEV_COLORS[d.severity] ?? "#9CA3AF"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-habb-line bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-habb-muted">
        {title}
      </p>
      {children}
    </div>
  );
}
