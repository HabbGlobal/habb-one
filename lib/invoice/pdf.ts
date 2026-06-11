// Komplettes Rechnungs-PDF mit Schweizer QR-Zahlteil unten.
//
// Layout A4-Hochkant:
//   - Oberer Bereich (oberhalb 105mm Rand) = Rechnungsdaten
//   - Untere 105 mm = QR-Bill (Empfangsschein + Zahlteil)

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { embedCompanyLogo, drawCompanyLogoTopRight } from "@/lib/pdf/logo";
import { safeWinAnsi as safe } from "@/lib/pdf/safe-text";
import type { InvoiceDetailDTO } from "@/lib/dto/invoice";
import { renderQrBill, A4_W, A4_H, cityLine } from "./qr-bill-render";

const MM = 2.83465;

interface CompanyInfo {
  name: string;
  address: string | null;
  city: string | null;
  vatNumber: string | null;
  qrIban: string | null;
  invoiceCreditorName: string | null;
  logoData?: Uint8Array | Buffer | null;
  logoMimeType?: string | null;
}

export interface InvoicePdfArgs {
  company: CompanyInfo;
  invoice: InvoiceDetailDTO;
}

export async function invoicePdf(args: InvoicePdfArgs): Promise<Uint8Array> {
  const { company, invoice } = args;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A4_W, A4_H]);

  // Firmen-Logo oben rechts einbetten (falls hochgeladen)
  const logo = await embedCompanyLogo(doc, {
    logoData: company.logoData ?? null,
    logoMimeType: company.logoMimeType ?? null,
  });
  if (logo) drawCompanyLogoTopRight(page, logo);

  // ─────────────────────────────────────────
  // Oberer Bereich: Rechnungsdaten (y > 105mm)
  // ─────────────────────────────────────────
  drawInvoiceHeader(page, font, fontBold, company, invoice);

  // ─────────────────────────────────────────
  // Unterer Bereich: QR-Zahlteil (y 0..105mm)
  // ─────────────────────────────────────────
  if (!company.qrIban) {
    // Kein QR-IBAN konfiguriert — Hinweis statt QR-Bill
    page.drawText(safe("⚠ Keine QR-IBAN in den Firmen-Einstellungen — bitte ergänzen."), {
      x: 5 * MM,
      y: 50,
      size: 9,
      font: fontBold,
      color: rgb(0.7, 0.1, 0.1),
    });
  } else {
    const ba = invoice.billingAddressSnapshot;
    await renderQrBill(page, {
      iban: company.qrIban,
      currency: "CHF",
      amountCHF: invoice.totalGrossCHF,
      creditor: {
        name: company.invoiceCreditorName ?? company.name,
        street: company.address ?? "",
        cityLine: company.city ?? "",
        country: "CH",
      },
      debtor: ba
        ? {
            name: ba.name,
            street: ba.street,
            cityLine: cityLine(ba.zip, ba.city),
            country: ba.country,
          }
        : undefined,
      referenceType: invoice.qrBillReference ? "QRR" : "NON",
      reference: invoice.qrBillReference ?? "",
      unstructuredMessage: `Rechnung ${invoice.invoiceNumber}`,
      fontRegular: font,
      fontBold,
    });
  }

  return doc.save();
}

// ─────────────────────────────────────────
// Oberer Bereich (Rechnungsdaten)
// ─────────────────────────────────────────

function drawInvoiceHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  company: CompanyInfo,
  invoice: InvoiceDetailDTO,
): void {
  const { width, height } = page.getSize();

  // Firmen-Header
  page.drawText(safe(company.name), {
    x: 5 * MM, y: height - 18 * MM,
    size: 14, font: fontBold,
  });
  if (company.address || company.city) {
    page.drawText(safe(`${company.address ?? ""}, ${company.city ?? ""}`.trim()), {
      x: 5 * MM, y: height - 24 * MM,
      size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
  }
  if (company.vatNumber) {
    page.drawText(safe(`MwSt-Nr. ${company.vatNumber}`), {
      x: 5 * MM, y: height - 30 * MM,
      size: 9, font, color: rgb(0.4, 0.4, 0.4),
    });
  }

  // Titel + Rechnungs-Nr.
  page.drawText("Rechnung", {
    x: 5 * MM, y: height - 50 * MM,
    size: 18, font: fontBold,
  });
  page.drawText(safe(invoice.invoiceNumber), {
    x: width - 60 * MM, y: height - 18 * MM,
    size: 14, font: fontBold,
  });

  // Empfänger-Adressblock (linker Bereich, y ~ 60mm-Bereich)
  const ba = invoice.billingAddressSnapshot;
  if (ba) {
    let y = height - 70 * MM;
    page.drawText(safe(ba.name), {
      x: 5 * MM, y, size: 11, font: fontBold,
    });
    y -= 5 * MM;
    page.drawText(safe(ba.street), { x: 5 * MM, y, size: 10, font });
    y -= 4.5 * MM;
    page.drawText(safe(`${ba.zip} ${ba.city}`), { x: 5 * MM, y, size: 10, font });
    if (ba.country && ba.country !== "CH") {
      y -= 4.5 * MM;
      page.drawText(safe(ba.country), { x: 5 * MM, y, size: 10, font });
    }
  } else {
    page.drawText(safe(invoice.customerDisplayName), {
      x: 5 * MM, y: height - 70 * MM,
      size: 11, font: fontBold,
    });
  }

  // Meta (rechts oben)
  let metaY = height - 70 * MM;
  const metaX = width - 75 * MM;
  const meta: Array<[string, string]> = [
    ["Rechnungs-Nr.", invoice.invoiceNumber],
    ["Datum", fmtDate(invoice.issuedAt)],
    ["Fällig am", fmtDate(invoice.dueAt)],
    ...(invoice.orderId ? [["Auftrag", "siehe Beilage"] as [string, string]] : []),
  ];
  for (const [k, v] of meta) {
    page.drawText(safe(k), {
      x: metaX, y: metaY, size: 9, font, color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(safe(v), {
      x: metaX + 25 * MM, y: metaY, size: 10, font: fontBold,
    });
    metaY -= 5 * MM;
  }

  // ── Items-Tabelle ──
  let y = height - 110 * MM;
  page.drawText("Positionen", {
    x: 5 * MM, y, size: 12, font: fontBold,
  });
  y -= 6 * MM;

  const cols = {
    pos: 5 * MM,
    desc: 15 * MM,
    qty: 110 * MM,
    unit: 130 * MM,
    price: 145 * MM,
    total: 175 * MM,
  };
  page.drawText("Pos.", { x: cols.pos, y, size: 9, font: fontBold });
  page.drawText("Beschreibung", { x: cols.desc, y, size: 9, font: fontBold });
  page.drawText("Menge", { x: cols.qty, y, size: 9, font: fontBold });
  page.drawText("Einheit", { x: cols.unit, y, size: 9, font: fontBold });
  page.drawText("Stückpreis", { x: cols.price, y, size: 9, font: fontBold });
  page.drawText("Total CHF", { x: cols.total, y, size: 9, font: fontBold });
  y -= 1.5 * MM;
  page.drawLine({
    start: { x: 5 * MM, y },
    end: { x: width - 5 * MM, y },
    color: rgb(0.6, 0.6, 0.6),
    thickness: 0.5,
  });
  y -= 5 * MM;

  for (const it of invoice.items) {
    if (y < 130 * MM) break; // genug Platz für QR-Bill lassen
    page.drawText(String(it.position), { x: cols.pos, y, size: 10, font });
    const descLines = wrapText(safe(it.description), 50);
    page.drawText(descLines[0] ?? "", { x: cols.desc, y, size: 10, font });
    if (descLines[1]) {
      y -= 4 * MM;
      page.drawText(descLines[1], {
        x: cols.desc, y, size: 9, font, color: rgb(0.4, 0.4, 0.4),
      });
    }
    page.drawText(formatQty(it.quantity), { x: cols.qty, y, size: 10, font });
    page.drawText(it.unit, { x: cols.unit, y, size: 10, font });
    page.drawText(fmtCHFraw(it.unitPriceCHF), { x: cols.price, y, size: 10, font });
    if (it.discountPct > 0) {
      // Discount-Hinweis
      y -= 4 * MM;
      page.drawText(safe(`Rabatt -${it.discountPct.toFixed(1)} %`), {
        x: cols.desc, y, size: 8, font, color: rgb(0.5, 0.5, 0.5),
      });
    }
    page.drawText(fmtCHFraw(it.totalCHF), {
      x: cols.total, y, size: 10, font: fontBold,
    });
    y -= 6 * MM;
  }

  // ── Summen ──
  y -= 4 * MM;
  page.drawLine({
    start: { x: 110 * MM, y: y + 2 * MM },
    end: { x: width - 5 * MM, y: y + 2 * MM },
    color: rgb(0.3, 0.3, 0.3),
    thickness: 1,
  });
  page.drawText("Total netto", {
    x: 110 * MM, y, size: 10, font,
  });
  page.drawText(fmtCHFraw(invoice.totalNetCHF), {
    x: cols.total, y, size: 10, font,
  });
  y -= 5 * MM;
  page.drawText(safe(`MwSt ${invoice.vatRate} %`), {
    x: 110 * MM, y, size: 10, font,
  });
  page.drawText(fmtCHFraw(invoice.vatCHF), {
    x: cols.total, y, size: 10, font,
  });
  y -= 5 * MM;
  page.drawLine({
    start: { x: 110 * MM, y: y + 2 * MM },
    end: { x: width - 5 * MM, y: y + 2 * MM },
    color: rgb(0.3, 0.3, 0.3),
    thickness: 0.7,
  });
  page.drawText("Total brutto", {
    x: 110 * MM, y, size: 12, font: fontBold,
  });
  page.drawText(fmtCHFraw(invoice.totalGrossCHF), {
    x: cols.total, y, size: 12, font: fontBold,
  });

  // Notizen
  if (invoice.notes) {
    let ny = y - 12 * MM;
    page.drawText("Hinweise", {
      x: 5 * MM, y: ny, size: 9, font: fontBold, color: rgb(0.5, 0.5, 0.5),
    });
    ny -= 4 * MM;
    for (const line of wrapText(safe(invoice.notes), 100).slice(0, 4)) {
      page.drawText(line, { x: 5 * MM, y: ny, size: 9, font });
      ny -= 4 * MM;
    }
  }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtCHFraw(n: number): string {
  // Format mit Apostroph + Punkt — Latin-1-tauglich
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${withSep}.${dec}`;
}

function formatQty(n: number): string {
  // Wenn ganzzahlig, ohne Dezimalen
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, "");
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
