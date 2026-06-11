/**
 * GET /api/cron/holidays
 *
 * Vercel-Cron-Endpoint, der einmal täglich für ALLE Mandanten sicherstellt,
 * dass die CH-Basis-Feiertage für das aktuelle UND das nächste Jahr in der
 * `Holiday`-Tabelle stehen. Idempotent über `@@unique([companyId, date])`
 * via `skipDuplicates`.
 *
 * Auth: Vercel sendet bei Cron-Calls `Authorization: Bearer ${CRON_SECRET}`.
 * Wir lehnen alles ohne dieses Header ab — damit niemand den Endpoint
 * manuell triggern kann ohne den Secret zu kennen.
 *
 * Konfiguration in vercel.json:
 *   { "crons": [{ "path": "/api/cron/holidays", "schedule": "0 3 * * *" }] }
 *   → täglich um 03:00 UTC.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSwissHolidayRows } from "@/lib/holidays/ch-defaults";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const years = [currentYear, currentYear + 1];

  const companies = await prisma.company.findMany({
    where: {
      // Suspendierte oder abgelehnte Mandanten brauchen keine neuen Feiertage.
      registrationStatus: "ACTIVE",
      suspendedAt: null,
    },
    select: { id: true, name: true },
  });

  const results: Array<{ id: string; name: string; created: number }> = [];
  for (const c of companies) {
    const rows = buildSwissHolidayRows(c.id, years);
    const r = await prisma.holiday.createMany({ data: rows, skipDuplicates: true });
    results.push({ id: c.id, name: c.name, created: r.count });
  }

  const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
  // eslint-disable-next-line no-console
  console.log(
    `[cron:holidays] ${now.toISOString()} — checked ${companies.length} tenants, ` +
      `inserted ${totalCreated} new holidays for years ${years.join(", ")}.`,
  );

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    years,
    tenantsChecked: companies.length,
    holidaysInserted: totalCreated,
    perTenant: results,
  });
}
