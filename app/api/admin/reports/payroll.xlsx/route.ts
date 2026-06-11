import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildPayrollReport } from "@/lib/reports/payroll";
import { payrollXlsx } from "@/lib/reports/payroll-xlsx";

const schema = z.object({
  employeeId: z.string().cuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  if (!hasPermission(session.user.role, "reports.export")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const report = await buildPayrollReport({
    companyId: session.user.companyId,
    employeeId: parsed.data.employeeId,
    year: parsed.data.year,
    month: parsed.data.month,
  });

  const buf = payrollXlsx(report, session.user.email ?? session.user.name ?? "");
  const fileName = `Personalabrechnung_${report.employee.employeeNumber}_${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}.xlsx`;
  // Encode-Helper für Content-Disposition mit Umlauten.
  const encoded = encodeURIComponent(fileName).replace(/'/g, "%27");

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encoded}`,
    },
  });
}
