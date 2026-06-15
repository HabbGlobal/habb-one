// PDF builders for Order documents:
//   - confirmationPdf:    Auftragsbestätigung (Kunde)
//   - deliveryNotePdf:    Lieferschein
//   - qrLabelPdf:         A6-Etikett mit Tracking-ID + URL
//
// Pure-server module: only Node-side `pdf-lib`, no DB. Caller passes the
// order DTO + addresses; routing happens in `app/api/admin/orders/...`.
//
// QR-Code: in dieser MVP-Version drucken wir die Tracking-URL als Klartext
// aus. Sobald das `qrcode`-Paket installiert ist, kann hier ein PNG-QR
// eingebettet werden (siehe `// TODO QR-Code`-Kommentar).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { OrderDetailDTO } from "@/lib/dto/order";
import { embedCompanyLogo, drawCompanyLogoTopRight } from "@/lib/pdf/logo";
import {
  materialLabel,
  complexityLabel,
  colorSystemLabel,
  applicationAreaLabel,
} from "@/lib/order/labels";

interface CompanyInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  logoData?: Uint8Array | Buffer | null;
  logoMimeType?: string | null;
}

interface AddressInfo {
  street: string;
  zip: string;
  city: string;
  country: string;
}

interface BuildArgs {
  company: CompanyInfo;
  order: OrderDetailDTO;
  shippingAddress?: AddressInfo | null;
  billingAddress?: AddressInfo | null;
  /** Public URL where the QR-Code points to (later: customer-portal). */
  trackingBaseUrl?: string;
}

// ─────────────────────────────────────────
// Helpers (shared)
// ─────────────────────────────────────────

const A4 = { w: 595.28, h: 841.89 };
const A6 = { w: 297.64, h: 419.53 };

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtCHF(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
  }).format(n);
}

function fmtMin(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} Min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} Min`;
}

function statusLabel(s: OrderDetailDTO["status"]): string {
  return {
    DRAFT: "Draft",
    CONFIRMED: "Confirmed",
    IN_PROGRESS: "In Progress",
    ON_HOLD: "On Hold",
    COMPLETED: "Completed",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
    INVOICED: "Invoiced",
  }[s];
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  company: CompanyInfo,
  title: string,
  orderNumber: string,
) {
  const { width, height } = page.getSize();
  page.drawText(company.name, {
    x: 40,
    y: height - 50,
    size: 16,
    font: fontBold,
  });
  if (company.address || company.city) {
    page.drawText(`${company.address ?? ""}${company.city ? `, ${company.city}` : ""}`, {
      x: 40,
      y: height - 68,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  if (company.vatNumber) {
    page.drawText(`VAT No. ${company.vatNumber}`, {
      x: 40,
      y: height - 80,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  page.drawText(title, {
    x: 40,
    y: height - 120,
    size: 18,
    font: fontBold,
  });
  page.drawText(orderNumber, {
    x: width - 200,
    y: height - 50,
    size: 14,
    font: fontBold,
  });
  // Divider
  page.drawLine({
    start: { x: 40, y: height - 130 },
    end: { x: width - 40, y: height - 130 },
    color: rgb(0.7, 0.7, 0.7),
    thickness: 0.5,
  });
}

function drawAddressBlock(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  label: string,
  address: AddressInfo | null | undefined,
  customerName: string,
  x: number,
  y: number,
) {
  page.drawText(label, { x, y, size: 9, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
  let cy = y - 14;
  page.drawText(customerName, { x, y: cy, size: 10, font: fontBold });
  if (address) {
    cy -= 12;
    page.drawText(address.street, { x, y: cy, size: 10, font });
    cy -= 12;
    page.drawText(`${address.zip} ${address.city}`, { x, y: cy, size: 10, font });
    if (address.country && address.country !== "CH") {
      cy -= 12;
      page.drawText(address.country, { x, y: cy, size: 10, font });
    }
  }
}

// ─────────────────────────────────────────
// Auftragsbestätigung
// ─────────────────────────────────────────

export async function confirmationPdf(args: BuildArgs): Promise<Uint8Array> {
  const { company, order, shippingAddress, billingAddress } = args;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logo = await embedCompanyLogo(doc, {
    logoData: company.logoData ?? null,
    logoMimeType: company.logoMimeType ?? null,
  });

  let page = doc.addPage([A4.w, A4.h]);
  if (logo) drawCompanyLogoTopRight(page, logo);
  drawHeader(page, font, fontBold, company, "Order Confirmation", order.orderNumber);

  // Address blocks
  drawAddressBlock(
    page,
    font,
    fontBold,
    "Billing Address",
    billingAddress,
    order.customerDisplayName,
    40,
    A4.h - 160,
  );
  if (shippingAddress) {
    drawAddressBlock(
      page,
      font,
      fontBold,
      "Shipping Address",
      shippingAddress,
      order.customerDisplayName,
      300,
      A4.h - 160,
    );
  }

  // Meta block
  let y = A4.h - 280;
  const meta: Array<[string, string]> = [
    ["Order Number", order.orderNumber],
    ["Status", statusLabel(order.status)],
    ["Received", fmtDate(order.receivedAt)],
    ["Delivery Date", fmtDate(order.promisedAt)],
    ["Tracking-ID", order.trackingId],
  ];
  for (const [k, v] of meta) {
    page.drawText(k, { x: 40, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    page.drawText(v, { x: 160, y, size: 10, font: fontBold });
    y -= 14;
  }

  // Customer notes
  if (order.customerNotes) {
    y -= 10;
    page.drawText("Notes", { x: 40, y, size: 9, font: fontBold, color: rgb(0.5, 0.5, 0.5) });
    y -= 14;
    for (const line of wrapText(order.customerNotes, 90).slice(0, 4)) {
      page.drawText(line, { x: 40, y, size: 10, font });
      y -= 12;
    }
  }

  // Items table header
  y -= 20;
  page.drawText("Items", { x: 40, y, size: 12, font: fontBold });
  y -= 16;
  const cols = { pos: 40, desc: 80, qty: 360, hours: 410, total: 490 };
  page.drawText("Pos.", { x: cols.pos, y, size: 9, font: fontBold });
  page.drawText("Description", { x: cols.desc, y, size: 9, font: fontBold });
  page.drawText("Qty", { x: cols.qty, y, size: 9, font: fontBold });
  page.drawText("Effort", { x: cols.hours, y, size: 9, font: fontBold });
  page.drawText("Total", { x: cols.total, y, size: 9, font: fontBold });
  y -= 4;
  page.drawLine({
    start: { x: 40, y },
    end: { x: A4.w - 40, y },
    color: rgb(0.7, 0.7, 0.7),
    thickness: 0.5,
  });
  y -= 10;

  for (const it of order.items) {
    if (y < 100) {
      page = doc.addPage([A4.w, A4.h]);
      if (logo) drawCompanyLogoTopRight(page, logo);
      y = A4.h - 60;
    }
    page.drawText(String(it.position), { x: cols.pos, y, size: 10, font });
    const descLines = wrapText(
      `${it.description} · ${it.surfaceM2} m² · ${materialLabel(it.material)} · ${complexityLabel(it.complexity)}` +
        (it.applicationArea ? ` · Application: ${applicationAreaLabel(it.applicationArea)}` : "") +
        (it.colorCode ? ` · ${colorSystemLabel(it.colorSystem)} ${it.colorCode}`.replace(/\s+/g, " ") : ""),
      55,
    );
    page.drawText(descLines[0] ?? "", { x: cols.desc, y, size: 10, font });
    if (descLines[1]) {
      y -= 10;
      page.drawText(descLines[1], { x: cols.desc, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    }
    page.drawText(String(it.quantity), { x: cols.qty, y, size: 10, font });
    page.drawText(fmtMin(it.totalEstimatedMinutes), { x: cols.hours, y, size: 10, font });
    if (it.unitPriceCHF != null) {
      page.drawText(fmtCHF(it.unitPriceCHF * it.quantity), {
        x: cols.total,
        y,
        size: 10,
        font,
      });
    }
    y -= 16;
  }

  // Total
  if (order.totalNetCHF != null) {
    y -= 10;
    page.drawLine({
      start: { x: 360, y: y + 6 },
      end: { x: A4.w - 40, y: y + 6 },
      color: rgb(0.3, 0.3, 0.3),
      thickness: 1,
    });
    page.drawText("Total (net)", {
      x: 360,
      y,
      size: 11,
      font: fontBold,
    });
    page.drawText(fmtCHF(order.totalNetCHF), {
      x: cols.total,
      y,
      size: 11,
      font: fontBold,
    });
  }

  // Footer
  page.drawText(
    "This document was generated electronically and is valid without signature.",
    {
      x: 40,
      y: 40,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    },
  );

  return doc.save();
}

// ─────────────────────────────────────────
// Lieferschein
// ─────────────────────────────────────────

export async function deliveryNotePdf(args: BuildArgs): Promise<Uint8Array> {
  const { company, order, shippingAddress } = args;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logo = await embedCompanyLogo(doc, {
    logoData: company.logoData ?? null,
    logoMimeType: company.logoMimeType ?? null,
  });

  const page = doc.addPage([A4.w, A4.h]);
  if (logo) drawCompanyLogoTopRight(page, logo);
  drawHeader(page, font, fontBold, company, "Delivery Note", order.orderNumber);

  drawAddressBlock(
    page,
    font,
    fontBold,
    "Shipping Address",
    shippingAddress,
    order.customerDisplayName,
    40,
    A4.h - 160,
  );

  // Meta
  let y = A4.h - 160;
  const x2 = 360;
  page.drawText("Tracking-ID", { x: x2, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 14;
  page.drawText(order.trackingId, { x: x2, y, size: 10, font: fontBold });
  y -= 18;
  page.drawText("Delivery Date", { x: x2, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 14;
  page.drawText(fmtDate(order.promisedAt), { x: x2, y, size: 10, font: fontBold });

  // Items list
  y = A4.h - 290;
  page.drawText("Delivery Items", { x: 40, y, size: 12, font: fontBold });
  y -= 16;
  page.drawText("Pos.", { x: 40, y, size: 9, font: fontBold });
  page.drawText("Description", { x: 80, y, size: 9, font: fontBold });
  page.drawText("Qty", { x: 460, y, size: 9, font: fontBold });
  y -= 4;
  page.drawLine({
    start: { x: 40, y },
    end: { x: A4.w - 40, y },
    color: rgb(0.7, 0.7, 0.7),
    thickness: 0.5,
  });
  y -= 12;
  for (const it of order.items) {
    page.drawText(String(it.position), { x: 40, y, size: 10, font });
    page.drawText(it.description.slice(0, 70), { x: 80, y, size: 10, font });
    page.drawText(String(it.quantity), { x: 460, y, size: 10, font });
    y -= 14;
  }

  // Receipt area
  y = 140;
  page.drawText("Date / Recipient Signature:", {
    x: 40,
    y,
    size: 10,
    font,
  });
  page.drawLine({
    start: { x: 40, y: y - 8 },
    end: { x: 380, y: y - 8 },
    color: rgb(0.4, 0.4, 0.4),
    thickness: 0.5,
  });

  return doc.save();
}

// ─────────────────────────────────────────
// QR-Etikett (A6)
// ─────────────────────────────────────────

export async function qrLabelPdf(args: BuildArgs): Promise<Uint8Array> {
  const { company, order, trackingBaseUrl } = args;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([A6.w, A6.h]);
  page.drawText(company.name, { x: 20, y: A6.h - 30, size: 12, font: fontBold });
  page.drawText("Order Label", {
    x: 20,
    y: A6.h - 46,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Auftragsnummer (gross)
  page.drawText(order.orderNumber, {
    x: 20,
    y: A6.h - 90,
    size: 22,
    font: fontBold,
  });

  // Kunde
  page.drawText("Customer", { x: 20, y: A6.h - 130, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  page.drawText(order.customerDisplayName.slice(0, 40), {
    x: 20,
    y: A6.h - 144,
    size: 11,
    font: fontBold,
  });

  // Liefertermin
  page.drawText("Delivery Date", {
    x: 20,
    y: A6.h - 170,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(fmtDate(order.promisedAt), {
    x: 20,
    y: A6.h - 184,
    size: 11,
    font: fontBold,
  });

  // Anzahl Positionen
  page.drawText("Items", {
    x: 150,
    y: A6.h - 170,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(String(order.items.length), {
    x: 150,
    y: A6.h - 184,
    size: 11,
    font: fontBold,
  });

  // QR placeholder (TODO QR-Code: hier später ein PNG via qrcode-Paket einbetten).
  // Zwischenzeitlich: einfacher Rahmen mit Tracking-ID + URL.
  const qrSize = 140;
  const qrX = (A6.w - qrSize) / 2;
  const qrY = 60;
  page.drawRectangle({
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 1,
  });
  page.drawText("QR-Code Placeholder", {
    x: qrX + 14,
    y: qrY + qrSize / 2,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawText("Tracking-ID:", {
    x: 20,
    y: 40,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(order.trackingToken, { x: 20, y: 28, size: 8, font });
  if (trackingBaseUrl) {
    page.drawText(`${trackingBaseUrl}/${order.trackingToken}`, {
      x: 20,
      y: 16,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return doc.save();
}

// ─────────────────────────────────────────
// Word wrap helper
// ─────────────────────────────────────────

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
