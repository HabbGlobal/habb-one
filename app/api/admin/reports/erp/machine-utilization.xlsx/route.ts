import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { loadMachineUtilization } from "@/lib/reports/erp/machine-utilization";
import { machineUtilizationXlsx } from "@/lib/reports/erp/xlsx";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  if (!hasPermission(session.user.role, "reports.export")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fromIso = url.searchParams.get("from");
  const toIso = url.searchParams.get("to");
  if (!fromIso || !toIso) {
    return NextResponse.json({ error: "MISSING_RANGE" }, { status: 400 });
  }

  try {
    const report = await loadMachineUtilization({
      prisma,
      companyId: session.user.companyId,
      from: new Date(`${fromIso}T00:00:00.000Z`),
      to: new Date(`${toIso}T23:59:59.999Z`),
    });
    const buf = await machineUtilizationXlsx(report, session.user.name ?? "Admin");
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Maschinen-Auslastung_${fromIso}_${toIso}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("[machine-utilization.xlsx] failed:", err);
    return NextResponse.json(
      { error: "EXPORT_FAILED", message: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
