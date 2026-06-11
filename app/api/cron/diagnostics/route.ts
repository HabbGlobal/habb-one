/**
 * GET /api/cron/diagnostics — stündliche Owner-Diagnose für ALLE
 * aktiven Mandanten. Auth via `Authorization: Bearer ${CRON_SECRET}`
 * (identisches Muster wie /api/cron/holidays).
 *
 * Fehler eines Mandanten dürfen den Gesamtlauf nicht stoppen — jede
 * Tenant-Diagnose ist isoliert. Response enthält NUR aggregierte,
 * unsensitive Zahlen (keine PII, keine Secrets).
 *
 * vercel.json: { "path": "/api/cron/diagnostics", "schedule": "0 * * * *" }
 *
 * E-Mail-Versand: Phase 2 (dieser Endpoint erzeugt nur den Datenstand).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDiagnosticsForCompany } from "@/lib/diagnostics/engine";
import { sendDiagnosticsDigestAndAlerts } from "@/lib/diagnostics/notify";
import { runPlatformChecks } from "@/lib/diagnostics/platform-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Plattform-weite Checks (RLS-Coverage o.ä.) laufen EINMAL vor den
  // pro-Tenant-Iterationen. Failures schlagen die Tenant-Schleife nicht.
  let platform = { checks: 0, warnings: 0 };
  try {
    platform = await runPlatformChecks();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[cron:diagnostics] platform-check failed", {
      message: e instanceof Error ? e.message : "unknown",
    });
  }

  const companies = await prisma.company.findMany({
    where: { registrationStatus: "ACTIVE", suspendedAt: null },
    select: { id: true },
  });

  let ok = 0;
  let failedRuns = 0;
  let critical = 0;
  let warning = 0;
  for (const c of companies) {
    try {
      const r = await runDiagnosticsForCompany(c.id, "cron");
      if (r.status === "failed") failedRuns++;
      else ok++;
      if (r.health === "critical") critical++;
      else if (r.health === "warning") warning++;
    } catch (e) {
      // Defense-in-depth: Engine fängt selbst, aber falls die
      // Run-Erzeugung scheitert, Lauf NICHT abbrechen.
      failedRuns++;
      // eslint-disable-next-line no-console
      console.error("[cron:diagnostics] tenant failed", {
        companyId: c.id,
        message: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  // E-Mail-Versand (Digest + Sofort-Alerts), best-effort.
  let notify = { digestSent: false, immediateSent: 0, skipped: true };
  try {
    const n = await sendDiagnosticsDigestAndAlerts();
    notify = {
      digestSent: n.digestSent,
      immediateSent: n.immediateSent,
      skipped: n.skipped,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[cron:diagnostics] notify failed", {
      message: e instanceof Error ? e.message : "unknown",
    });
  }

  const ranAt = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(
    `[cron:diagnostics] ${ranAt} — ${companies.length} tenants, ` +
      `${ok} ok, ${failedRuns} failed, ${critical} critical, ${warning} warning, ` +
      `digest=${notify.digestSent} immediate=${notify.immediateSent}.`,
  );

  return NextResponse.json({
    ok: true,
    ranAt,
    tenantsChecked: companies.length,
    runsOk: ok,
    runsFailed: failedRuns,
    critical,
    warning,
    platform,
    email: notify,
  });
}
