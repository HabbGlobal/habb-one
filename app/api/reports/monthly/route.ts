import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildMonthlyReport } from "@/lib/reports/monthly";
import { monthlyCsv } from "@/lib/reports/csv";
import { monthlyXlsx } from "@/lib/reports/xlsx";
import { monthlyPdf } from "@/lib/reports/pdf";

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  format: z.enum(["csv", "xlsx", "pdf"]),
  employeeId: z.string().cuid().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  if (!hasPermission(session.user.role, "reports.export")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const report = await buildMonthlyReport({
    companyId: session.user.companyId,
    year: parsed.data.year,
    month: parsed.data.month,
    employeeId: parsed.data.employeeId,
  });
  const exportedBy = session.user.name ?? session.user.email ?? "Admin";
  const monthStr = String(parsed.data.month).padStart(2, "0");
  const baseName = `Zeitrapport_${parsed.data.year}-${monthStr}${
    parsed.data.employeeId ? `_${parsed.data.employeeId.slice(0, 6)}` : ""
  }`;

  if (parsed.data.format === "csv") {
    const csv = monthlyCsv(report, exportedBy);
    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      },
    });
  }
  if (parsed.data.format === "xlsx") {
    const buf = monthlyXlsx(report, exportedBy);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  }
  const pdf = await monthlyPdf(report, exportedBy);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}.pdf"`,
    },
  });
}
