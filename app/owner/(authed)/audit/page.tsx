import Link from "next/link";
import type { OwnerAuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AuditPayload } from "@/components/owner/AuditPayload";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Globaler Owner-Audit-Log mit serverseitiger Filterung über URL-Parameter.
 * Append-only: jeder Lookup ist read-only — keine Mutationen hier.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    owner?: string;
    tenant?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const skip = (pageNum - 1) * PAGE_SIZE;

  const where: Prisma.OwnerAuditLogWhereInput = {};
  if (sp.action && isAuditAction(sp.action)) where.action = sp.action;
  if (sp.owner) where.ownerEmail = { contains: sp.owner, mode: "insensitive" };
  if (sp.tenant) {
    where.OR = [
      { targetCompanyId: sp.tenant },
      { targetCompany: { name: { contains: sp.tenant, mode: "insensitive" } } },
    ];
  }
  if (sp.from || sp.to) {
    where.timestamp = {};
    if (sp.from) where.timestamp.gte = new Date(`${sp.from}T00:00:00.000Z`);
    if (sp.to) where.timestamp.lte = new Date(`${sp.to}T23:59:59.999Z`);
  }

  const [events, total, knownActions] = await Promise.all([
    prisma.ownerAuditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: PAGE_SIZE,
      skip,
      include: {
        targetCompany: { select: { id: true, name: true } },
        targetUser: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.ownerAuditLog.count({ where }),
    prisma.ownerAuditLog
      .findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      })
      .then((rows) => rows.map((r) => r.action)),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(sp.action || sp.owner || sp.tenant || sp.from || sp.to);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">Plattform</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-habb-black">
          Audit-Log
        </h1>
        <p className="mt-1 text-sm text-habb-muted">
          {total.toLocaleString("de-CH")} Einträge gesamt · Seite {pageNum} von{" "}
          {totalPages.toLocaleString("de-CH")}
        </p>
      </header>

      {/* Filter-Bar als GET-Form, damit die URL die einzige Source of Truth bleibt */}
      <form
        method="get"
        className="rounded-lg border border-habb-line bg-white p-4 grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end"
      >
        <label className="space-y-1 text-xs">
          <span className="block uppercase tracking-wide text-habb-muted">Aktion</span>
          <select
            name="action"
            defaultValue={sp.action ?? ""}
            className="w-full rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Alle</option>
            {knownActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="block uppercase tracking-wide text-habb-muted">Owner-E-Mail</span>
          <input
            name="owner"
            defaultValue={sp.owner ?? ""}
            placeholder="z.B. atavin@"
            className="w-full rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="block uppercase tracking-wide text-habb-muted">Mandant</span>
          <input
            name="tenant"
            defaultValue={sp.tenant ?? ""}
            placeholder="Name oder ID"
            className="w-full rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="block uppercase tracking-wide text-habb-muted">Von</span>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="w-full rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="block uppercase tracking-wide text-habb-muted">Bis</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="w-full rounded-md border border-habb-line bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <div className="md:col-span-5 flex items-center gap-2 justify-end pt-1">
          {hasFilters && (
            <Link
              href="/owner/audit"
              className="rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-muted hover:text-habb-ink"
            >
              Zurücksetzen
            </Link>
          )}
          <button
            type="submit"
            className="rounded-md bg-habb-black px-4 py-1.5 text-xs font-medium text-white hover:bg-habb-ink"
          >
            Filter anwenden
          </button>
        </div>
      </form>

      <section className="rounded-lg border border-habb-line bg-white">
        {events.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-habb-muted">
            Keine Einträge für die aktuelle Auswahl.
          </p>
        ) : (
          <ul className="divide-y divide-habb-line">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono text-xs text-habb-muted whitespace-nowrap">
                    {e.timestamp.toLocaleString("de-CH")}
                  </span>
                  <span className="font-medium text-habb-ink">{e.action}</span>
                  {e.targetCompany && (
                    <Link
                      href={`/owner/tenants/${e.targetCompany.id}`}
                      className="text-xs text-habb-ink underline-offset-2 hover:underline"
                    >
                      {e.targetCompany.name}
                    </Link>
                  )}
                  {e.targetUser && (
                    <span className="text-xs text-habb-muted">
                      → User {e.targetUser.name} &lt;{e.targetUser.email}&gt;
                    </span>
                  )}
                  <span className="ml-auto text-xs text-habb-muted">{e.ownerEmail}</span>
                </div>
                {(e.reason || e.ticketRef) && (
                  <div className="mt-1 text-xs italic text-habb-muted">
                    {e.reason ? `„${e.reason}"` : ""}
                    {e.ticketRef ? ` · Ticket ${e.ticketRef}` : ""}
                  </div>
                )}
                {(e.payloadBefore || e.payloadAfter || e.ipAddress) && (
                  <AuditPayload
                    payloadBefore={e.payloadBefore}
                    payloadAfter={e.payloadAfter}
                    ipAddress={e.ipAddress}
                    userAgent={e.userAgent}
                    requestId={e.requestId}
                    consentTokenId={e.consentTokenId}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-habb-line px-5 py-3 text-sm">
            <PageLink sp={sp} target={pageNum - 1} disabled={pageNum <= 1}>
              ← Zurück
            </PageLink>
            <span className="text-xs text-habb-muted">
              Seite {pageNum} von {totalPages}
            </span>
            <PageLink sp={sp} target={pageNum + 1} disabled={pageNum >= totalPages}>
              Weiter →
            </PageLink>
          </footer>
        )}
      </section>
    </div>
  );
}

function isAuditAction(v: string): v is OwnerAuditAction {
  // Whitelist via known actions — wir vertrauen dem URL-Param nicht blind.
  // Da der Filter aus der Distinct-Query mit dem Schema validiert wird,
  // reicht hier die String-Form, Prisma validiert serverseitig.
  return /^[A-Z_]+$/.test(v);
}

function PageLink({
  sp,
  target,
  disabled,
  children,
}: {
  sp: Record<string, string | undefined>;
  target: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-habb-line bg-habb-paper px-3 py-1.5 text-xs text-habb-muted/60">
        {children}
      </span>
    );
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "page") params.set(k, v);
  }
  params.set("page", String(target));
  return (
    <Link
      href={`/owner/audit?${params.toString()}`}
      className="rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
    >
      {children}
    </Link>
  );
}
