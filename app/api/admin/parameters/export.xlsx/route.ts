// Excel export of all system parameters — one row per parameter, columns
// for category / sub-category / current / default / unit / min / max / last
// change. Importable by the (later) bulk-import workflow.

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getCompanyLocale } from "@/lib/company-context";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  if (!hasPermission(session.user.role, "parameters.read")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const params = await prisma.systemParameter.findMany({
    where: { companyId: session.user.companyId },
    include: { updatedBy: { select: { name: true } } },
    orderBy: [{ category: "asc" }, { subCategory: "asc" }, { key: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = session.user.name ?? "Admin";
  wb.created = new Date();
  wb.title = "System-Parameter";

  const ws = wb.addWorksheet("Parameter");
  ws.columns = [
    { header: "Key", key: "key", width: 50 },
    { header: "Kategorie", key: "category", width: 18 },
    { header: "Untergruppe", key: "subCategory", width: 24 },
    { header: "Bezeichnung", key: "label", width: 42 },
    { header: "Aktueller Wert", key: "currentValue", width: 16 },
    { header: "Default", key: "defaultValue", width: 12 },
    { header: "Einheit", key: "unit", width: 10 },
    { header: "Min", key: "minValue", width: 8 },
    { header: "Max", key: "maxValue", width: 8 },
    { header: "Geändert am", key: "updatedAt", width: 18 },
    { header: "Geändert von", key: "updatedBy", width: 22 },
  ];
  // Header style
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  ws.getRow(1).alignment = { vertical: "middle" };
  ws.getRow(1).height = 22;

  const companyLocale = await getCompanyLocale(session.user.companyId);

  for (const p of params) {
    ws.addRow({
      key: p.key,
      category: p.category,
      subCategory: p.subCategory ?? "",
      label: p.label,
      currentValue: p.currentValue,
      defaultValue: p.defaultValue,
      unit: p.unit ?? "",
      minValue: p.minValue?.toString() ?? "",
      maxValue: p.maxValue?.toString() ?? "",
      updatedAt: p.updatedAt.toLocaleString("de-CH", { timeZone: companyLocale.timezone }),
      updatedBy: p.updatedBy.name,
    });
  }

  // Highlight rows where current ≠ default (show user customizations).
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    if (row.getCell("currentValue").value !== row.getCell("defaultValue").value) {
      row.getCell("currentValue").font = { bold: true, color: { argb: "FF1D4ED8" } };
    }
  }

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf as ArrayBuffer) as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="System-Parameter_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
