import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  buildScheduleReport,
  endOfIsoWeek,
  lastDayOfMonth,
  startOfIsoWeek,
} from "@/lib/reports/schedule";
import { schedulePdf } from "@/lib/reports/schedule-pdf";
import { scheduleXlsx } from "@/lib/reports/schedule-xlsx";
import { getCompanyLocale } from "@/lib/company-context";

const schema = z.object({
  format: z.enum(["pdf", "xlsx"]),
  // Either ?year=YYYY&month=M (full month) or ?weekStart=YYYY-MM-DD (any
  // date inside the desired ISO week).
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  areaId: z.string().cuid().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  if (!hasPermission(session.user.role, "reports.export")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { format, year, month, weekStart, areaId } = parsed.data;

  // Determine date range and mode.
  let from: string;
  let to: string;
  let mode: "month" | "week";
  if (weekStart) {
    from = startOfIsoWeek(weekStart);
    to = endOfIsoWeek(weekStart);
    mode = "week";
  } else if (year && month) {
    from = `${year}-${String(month).padStart(2, "0")}-01`;
    to = lastDayOfMonth(year, month);
    mode = "month";
  } else {
    return NextResponse.json(
      { error: "Bitte year+month oder weekStart angeben." },
      { status: 400 }
    );
  }

  const report = await buildScheduleReport({
    companyId: session.user.companyId,
    from,
    to,
    areaId: areaId ?? null,
    mode,
  });
  const exportedBy = session.user.name ?? session.user.email ?? "Admin";
  const companyLocale = await getCompanyLocale(session.user.companyId);

  const baseName =
    mode === "month"
      ? `Plan_${from.slice(0, 7)}`
      : `Plan_KW${weekNumber(from)}_${from.slice(0, 4)}`;
  const suffix = areaId ? `_${areaId.slice(0, 6)}` : "";

  if (format === "xlsx") {
    const buf = await scheduleXlsx(report, exportedBy, companyLocale.timezone);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}${suffix}.xlsx"`,
      },
    });
  }
  const pdf = await schedulePdf(report, exportedBy, companyLocale.timezone);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${baseName}${suffix}.pdf"`,
    },
  });
}

function weekNumber(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7) - 3);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
