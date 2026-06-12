// Offerten-PDF (Kunde) — analog zur Auftragsbestätigung, aber mit
// Gültigkeits-Datum, MwSt-Aufschlag und Gesamt-Brutto.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { QuoteDetailDTO } from "@/lib/dto/quote";
import { embedCompanyLogo, drawCompanyLogoTopRight } from "@/lib/pdf/logo";
import {
  materialLabel,
  complexityLabel,
  colorSystemLabel,
  applicationAreaLabel,
  processLabelShort,
} from "@/lib/order/labels";

/**
 * pdf-lib's StandardFonts (Helvetica) verwenden WinAnsi-Encoding. Manche
 * Unicode-Zeichen werfen sonst Exceptions — wir mappen die häufigsten Fälle
 * defensiv auf ASCII.
 */
function safe(text: string): string {
  return text
    .replace(/→/g, "->")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"');
}

const A4 = { w: 595.28, h: 841.89 };

interface AddressInfo {
  street: string;
  zip: string;
  city: string;
  country: string;
}

interface BuildArgs {
  company: {
    name: string;
    address?: string | null;
    city?: string | null;
    vatNumber?: string | null;
    logoData?: Uint8Array | Buffer | null;
    logoMimeType?: string | null;
  };
  quote: QuoteDetailDTO;
  billingAddress?: AddressInfo | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtCHF(n: number): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}

function statusLabel(s: QuoteDetailDTO["status"]): string {
  return {
    DRAFT: "Entwurf",
    SENT: "Versendet",
    ACCEPTED: "Angenommen",
    REJECTED: "Abgelehnt",
    EXPIRED: "Abgelaufen",
  }[s];
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  company: BuildArgs["company"],
  quoteNumber: string,
) {
  const { width, height } = page.getSize();
  page.drawText(safe(company.name), {
    x: 40, y: height - 50, size: 16, font: fontBold,
  });
  if (company.address || company.city) {
    page.drawText(
      safe(`${company.address ?? ""}${company.city ? `, ${company.city}` : ""}`),
      { x: 40, y: height - 68, size: 9, font, color: rgb(0.4, 0.4, 0.4) },
    );
  }
  if (company.vatNumber) {
    page.drawText(safe(`MwSt-Nr. ${company.vatNumber}`), {
      x: 40, y: height - 80, size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
  }
  page.drawText("Offerte", {
    x: 40, y: height - 120, size: 18, font: fontBold,
  });
  page.drawText(safe(quoteNumber), {
    x: width - 200, y: height - 50, size: 14, font: fontBold,
  });
  page.drawLine({
    start: { x: 40, y: height - 130 },
    end: { x: width - 40, y: height - 130 },
    color: rgb(0.7, 0.7, 0.7),
    thickness: 0.5,
  });
}

function drawAddress(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  customerName: string,
  address: AddressInfo | null | undefined,
  x: number,
  y: number,
) {
  page.drawText("Empfänger", {
    x, y, size: 9, font: fontBold, color: rgb(0.5, 0.5, 0.5),
  });
  let cy = y - 14;
  page.drawText(safe(customerName), { x, y: cy, size: 10, font: fontBold });
  if (address) {
    cy -= 12;
    page.drawText(safe(address.street), { x, y: cy, size: 10, font });
    cy -= 12;
    page.drawText(safe(`${address.zip} ${address.city}`), {
      x, y: cy, size: 10, font,
    });
    if (address.country && address.country !== "CH") {
      cy -= 12;
      page.drawText(safe(address.country), { x, y: cy, size: 10, font });
    }
  }
}

function wrapText(text: string, charsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > charsPerLine) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function quotePdf(args: BuildArgs): Promise<Uint8Array> {
  const { company, quote, billingAddress } = args;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logo = await embedCompanyLogo(doc, {
    logoData: company.logoData ?? null,
    logoMimeType: company.logoMimeType ?? null,
  });

  let page = doc.addPage([A4.w, A4.h]);
  if (logo) drawCompanyLogoTopRight(page, logo);
  drawHeader(page, font, fontBold, company, quote.quoteNumber);

  // Empfänger
  drawAddress(
    page,
    font,
    fontBold,
    quote.customerDisplayName,
    billingAddress,
    40,
    A4.h - 160,
  );

  // Meta
  let y = A4.h - 280;
  const meta: Array<[string, string]> = [
    ["Offerte-Nr.", quote.quoteNumber],
    ["Status", statusLabel(quote.status)],
    ["Date", fmtDate(quote.createdAt)],
    ["Gültig bis", fmtDate(quote.validUntil)],
  ];
  for (const [k, v] of meta) {
    page.drawText(safe(k), { x: 40, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText(safe(v), { x: 160, y, size: 10, font: fontBold });
    y -= 14;
  }

  if (quote.notes) {
    y -= 10;
    page.drawText("Hinweise", {
      x: 40, y, size: 9, font: fontBold, color: rgb(0.5, 0.5, 0.5),
    });
    y -= 14;
    for (const line of wrapText(quote.notes, 90).slice(0, 4)) {
      page.drawText(safe(line), { x: 40, y, size: 10, font });
      y -= 12;
    }
  }

  // Items table
  y -= 20;
  page.drawText("Positionen", {
    x: 40, y, size: 12, font: fontBold,
  });
  y -= 16;
  const cols = { pos: 40, desc: 80, qty: 360, unit: 410, total: 490 };
  page.drawText("Pos.", { x: cols.pos, y, size: 9, font: fontBold });
  page.drawText("Beschreibung", { x: cols.desc, y, size: 9, font: fontBold });
  page.drawText("Stk.", { x: cols.qty, y, size: 9, font: fontBold });
  page.drawText("Stückpreis", { x: cols.unit, y, size: 9, font: fontBold });
  page.drawText("Total", { x: cols.total, y, size: 9, font: fontBold });
  y -= 4;
  page.drawLine({
    start: { x: 40, y },
    end: { x: A4.w - 40, y },
    color: rgb(0.7, 0.7, 0.7),
    thickness: 0.5,
  });
  y -= 10;

  for (const it of quote.items) {
    if (y < 140) {
      page = doc.addPage([A4.w, A4.h]);
      if (logo) drawCompanyLogoTopRight(page, logo);
      y = A4.h - 60;
    }
    page.drawText(safe(String(it.position)), {
      x: cols.pos, y, size: 10, font,
    });

    // Erste Zeile: Beschreibung + Stammdaten (Material/Komplexität/Farbe/Anwendung)
    const descParts: string[] = [it.description];
    if (it.surfaceM2) descParts.push(`${it.surfaceM2} m²`);
    if (it.material) descParts.push(safe(materialLabel(it.material)));
    if (it.complexity) descParts.push(safe(complexityLabel(it.complexity)));
    if (it.applicationArea) {
      descParts.push(safe(`Anwendung: ${applicationAreaLabel(it.applicationArea)}`));
    }
    if (it.colorCode) {
      const cs = it.colorSystem ? colorSystemLabel(it.colorSystem) : "";
      descParts.push(`${cs} ${it.colorCode}`.trim());
    }
    const desc = descParts.join(" · ");
    const lines = wrapText(safe(desc), 50);
    page.drawText(lines[0] ?? "", { x: cols.desc, y, size: 10, font });
    if (lines[1]) {
      y -= 10;
      page.drawText(lines[1], {
        x: cols.desc, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      });
    }

    // Mengen + Preise auf Hauptzeile
    page.drawText(String(it.quantity), { x: cols.qty, y, size: 10, font });
    page.drawText(fmtCHF(it.unitPriceCHF), { x: cols.unit, y, size: 10, font });
    page.drawText(fmtCHF(it.totalPriceCHF), {
      x: cols.total, y, size: 10, font: fontBold,
    });

    // Minimalistische Schritt-Aufzählung darunter — KEINE Zeiten,
    // nur damit der Kunde sieht, was wir machen.
    if (it.steps.length > 0) {
      y -= 11;
      const stepsLine = it.steps
        .map((s, i) => `${i + 1}. ${processLabelShort(s.processCode)}`)
        .join("  ·  ");
      const stepLines = wrapText(safe(stepsLine), 70);
      for (const line of stepLines.slice(0, 3)) {
        page.drawText(line, {
          x: cols.desc + 8,
          y,
          size: 8,
          font,
          color: rgb(0.45, 0.45, 0.45),
        });
        y -= 10;
      }
      y += 4; // bisschen weniger Abstand zur nächsten Position
    }
    y -= 14;
  }

  // Total + MwSt
  y -= 6;
  page.drawLine({
    start: { x: 360, y: y + 6 },
    end: { x: A4.w - 40, y: y + 6 },
    color: rgb(0.3, 0.3, 0.3),
    thickness: 1,
  });
  page.drawText("Total netto", {
    x: 360, y, size: 10, font,
  });
  page.drawText(fmtCHF(quote.totalNetCHF), {
    x: cols.total, y, size: 10, font,
  });
  y -= 14;
  const vatCHF = round2((quote.totalNetCHF * quote.vatRate) / 100);
  page.drawText(safe(`MwSt ${quote.vatRate}%`), {
    x: 360, y, size: 10, font,
  });
  page.drawText(fmtCHF(vatCHF), { x: cols.total, y, size: 10, font });
  y -= 14;
  page.drawLine({
    start: { x: 360, y: y + 4 },
    end: { x: A4.w - 40, y: y + 4 },
    color: rgb(0.3, 0.3, 0.3),
    thickness: 0.7,
  });
  page.drawText("Total brutto", {
    x: 360, y, size: 12, font: fontBold,
  });
  page.drawText(fmtCHF(round2(quote.totalNetCHF + vatCHF)), {
    x: cols.total, y, size: 12, font: fontBold,
  });

  // Footer
  page.drawText(
    safe(
      `Diese Offerte ist gültig bis ${fmtDate(quote.validUntil)}. ` +
        "Erstellt elektronisch — ohne Unterschrift gültig.",
    ),
    { x: 40, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5) },
  );

  return doc.save();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
