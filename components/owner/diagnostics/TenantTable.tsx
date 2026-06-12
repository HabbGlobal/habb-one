"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Loader2, RefreshCw, Search } from "lucide-react";

interface Row {
  companyId: string;
  name: string;
  status: string;
  score: number;
  lastCheckedAt: string | null;
  critical: number;
  warning: number;
  open: number;
  security: number;
  avgResponseMs: number | null;
}

const STATUS_BADGE: Record<string, string> = {
  healthy: "bg-habb-success/10 text-habb-success",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-habb-red/10 text-habb-red",
  unknown: "bg-habb-paper text-habb-muted",
};

export function TenantTable({ tenants }: { tenants: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const rows = useMemo(() => {
    return tenants.filter(
      (t) =>
        (statusFilter === "all" || t.status === statusFilter) &&
        t.name.toLowerCase().includes(q.toLowerCase()),
    );
  }, [tenants, q, statusFilter]);

  const recheck = (companyId: string) => {
    setBusy(companyId);
    start(async () => {
      try {
        await fetch("/api/owner/diagnostics/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId }),
        });
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-habb-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tenant suchen…"
            className="rounded-md border border-habb-line bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-habb-red"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="healthy">Healthy</option>
          <option value="unknown">Unknown</option>
        </select>
        <span className="text-xs text-habb-muted">
          {rows.length} / {tenants.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-habb-line text-sm">
          <thead className="bg-habb-paper text-left text-xs uppercase tracking-wide text-habb-muted">
            <tr>
              <th className="px-5 py-2.5">Tenant</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Score</th>
              <th className="px-3 py-2.5">Crit.</th>
              <th className="px-3 py-2.5">Warn.</th>
              <th className="px-3 py-2.5">Security</th>
              <th className="px-3 py-2.5">Last check</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-habb-line">
            {rows.map((t) => (
              <tr key={t.companyId} className="hover:bg-habb-paper/40">
                <td className="px-5 py-2.5">
                  <Link
                    href={`/owner/diagnostics/${t.companyId}`}
                    className="font-medium text-habb-ink hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? STATUS_BADGE.unknown}`}
                  >
                    {t.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums font-semibold">
                  {t.score}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-habb-red">
                  {t.critical}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-amber-600">
                  {t.warning}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{t.security}</td>
                <td className="px-3 py-2.5 text-xs text-habb-muted">
                  {t.lastCheckedAt
                    ? new Date(t.lastCheckedAt).toLocaleString("de-CH")
                    : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/owner/diagnostics/${t.companyId}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-habb-black px-2.5 py-1 text-xs font-medium text-white hover:bg-habb-ink"
                    >
                      <Eye className="h-3.5 w-3.5" />Details</Link>
                    <button
                      type="button"
                      onClick={() => recheck(t.companyId)}
                      disabled={busy === t.companyId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-habb-line px-2.5 py-1 text-xs font-medium text-habb-ink hover:bg-habb-paper disabled:opacity-60"
                    >
                      {busy === t.companyId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Check
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-6 text-center text-sm text-habb-muted"
                >
                  Keine Tenanten.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
