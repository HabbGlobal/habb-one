// Minimal PDF generator using pdf-lib. We build a one-page summary plus
// per-employee rows. Layout is intentionally simple — fits the MVP scope
// while remaining printer-friendly.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatMin, type EmployeeMonthly } from "./monthly";
import { embedCompanyLogo, drawCompanyLogoTopRight } from "@/lib/pdf/logo";

interface ReportInput {
  company: {
    name: string;
    logoData?: Uint8Array | Buffer | null;
    logoMimeType?: string | null;
  };
  period: { year: number; month: number; from: string; to: string };
  employees: EmployeeMonthly[];
}

export async function monthlyPdf(report: ReportInput, exportedBy: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const monthLabels = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const logo = await embedCompanyLogo(doc, {
    logoData: report.company.logoData ?? null,
    logoMimeType: report.company.logoMimeType ?? null,
  });

  function addPage(title: string) {
    const page = doc.addPage([595.28, 841.89]); // A4 portrait
    if (logo) drawCompanyLogoTopRight(page, logo);
    const { height } = page.getSize();
    page.drawText(report.company.name, { x: 40, y: height - 40, size: 14, font: fontBold });
    page.drawText(`Time Report — ${title}`, { x: 40, y: height - 60, size: 12, font });
    page.drawText(
      `Period: ${report.period.from} – ${report.period.to}    Created: ${new Date()
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")}    Exported by: ${exportedBy}`,
      { x: 40, y: height - 78, size: 9, font, color: rgb(0.4, 0.4, 0.4) }
    );
    return { page, top: height - 110 };
  }

  // Summary page
  let { page, top } = addPage(`Overview ${monthLabels[report.period.month - 1]} ${report.period.year}`);
  const headers = ["Nr", "Employee", "Target", "Worked", "Break", "Balance"];
  const cols = [40, 80, 290, 360, 430, 490];
  headers.forEach((h, i) => page.drawText(h, { x: cols[i], y: top, size: 10, font: fontBold }));
  top -= 14;
  for (const e of report.employees) {
    if (top < 60) ({ page, top } = addPage(`Overview (cont.)`));
    const row = [
      e.employeeNumber,
      `${e.lastName} ${e.firstName}`,
      formatMin(e.totals.targetMinutes),
      formatMin(e.totals.workedMinutes),
      formatMin(e.totals.breakMinutes),
      formatMin(e.totals.balanceMinutes),
    ];
    row.forEach((v, i) => page.drawText(v, { x: cols[i], y: top, size: 10, font }));
    top -= 14;
  }

  // One page per employee with daily details
  for (const e of report.employees) {
    let p = addPage(`${e.lastName} ${e.firstName} (${e.employeeNumber})`);
    const detailHeaders = ["Date", "Day", "Target", "Worked", "Break", "Balance", "Note"];
    const detailCols = [40, 110, 160, 210, 260, 310, 360];
    detailHeaders.forEach((h, i) =>
      p.page.drawText(h, { x: detailCols[i], y: p.top, size: 10, font: fontBold })
    );
    p.top -= 14;
    for (const d of e.days) {
      if (p.top < 60) p = addPage(`${e.lastName} ${e.firstName} (cont.)`);
      const row = [
        d.date,
        d.weekday,
        formatMin(d.targetMinutes),
        formatMin(d.workedMinutes),
        formatMin(d.breakMinutes),
        formatMin(d.balanceMinutes),
        (d.holidayName ?? d.absence?.labelDe ?? "").slice(0, 28),
      ];
      row.forEach((v, i) => p.page.drawText(v, { x: detailCols[i], y: p.top, size: 9, font }));
      p.top -= 12;
    }
    p.top -= 6;
    if (p.top < 80) p = addPage(`${e.lastName} ${e.firstName} (Total)`);
    p.page.drawText(
      `Total Target: ${formatMin(e.totals.targetMinutes)}    Worked: ${formatMin(
        e.totals.workedMinutes
      )}    Balance: ${formatMin(e.totals.balanceMinutes)}`,
      { x: 40, y: p.top, size: 11, font: fontBold }
    );
  }

  return doc.save();
}
