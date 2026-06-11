// Render des Schweizer QR-Zahlteils + Empfangsscheins.
//
// Layout-Konstanten gemäss SIX Style Guide v2.3:
//   - A4-Hochkant 210×297 mm
//   - Untere 105 mm = QR-Bill-Bereich
//   - Empfangsschein 62 mm breit (links)
//   - Zahlteil 148 mm breit (rechts)
//   - Trennlinie zwischen Empfangsschein und Zahlteil
//   - Perforations-Hinweis-Linie 105 mm vom unteren Rand
//
// QR-Code: 46×46 mm mit zentriertem Schweizer-Plus-Symbol (7×7 mm).
//
// Diese Funktion zeichnet NUR den QR-Bill-Bereich auf eine bereits
// existierende PDFPage (A4). Caller hängt selbst Header / Items /
// Summen darüber — siehe `lib/invoice/pdf.ts`.

import {
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";
import QRCode from "qrcode";
import {
  buildQrBillPayload,
  cityLine,
  type QrBillPayloadInput,
} from "./qr-payload";
import { formatIbanDisplay, formatQrReferenceDisplay } from "./qr-reference";

const MM = 2.83465; // mm → pt

/** A4 in pt (für Validierung / Layout-Rechnung). */
export const A4_W = 210 * MM; // 595.28
export const A4_H = 297 * MM; // 841.89

/** QR-Bill-Bereich (untere 105 mm) — y-Koordinate 0..297.64. */
const QR_AREA_H = 105 * MM; // 297.64
const RECEIPT_W = 62 * MM; // 175.75
const PAYMENT_W = 148 * MM; // 419.53

const TEXT = {
  receipt: "Empfangsschein",
  payment: "Zahlteil",
  account: "Konto / Zahlbar an",
  reference: "Referenz",
  payableBy: "Zahlbar durch",
  payableByEmpty: "Zahlbar durch (Name/Adresse)",
  currency: "Währung",
  amount: "Betrag",
  acceptance: "Annahmestelle",
  additionalInfo: "Zusätzliche Informationen",
  separateBeforeUse: "Vor der Einzahlung abzutrennen",
};

export interface QrBillRenderInput extends QrBillPayloadInput {
  /** Bereits vorhandene Latin-1-konforme Schriften (helvetica + bold). */
  fontRegular: PDFFont;
  fontBold: PDFFont;
}

/**
 * Zeichnet den QR-Bill-Bereich auf die untere Hälfte der gegebenen Seite.
 */
export async function renderQrBill(
  page: PDFPage,
  input: QrBillRenderInput,
): Promise<void> {
  const payload = buildQrBillPayload(input);

  // QR-Code als PNG (46×46mm Zielgrösse — wir generieren bei 4x Auflösung).
  const qrPxSize = Math.round(46 * MM * 3); // ~390 px → scharf bei 300dpi-Druck
  const qrPng = await QRCode.toBuffer(payload, {
    type: "png",
    width: qrPxSize,
    margin: 0,
    errorCorrectionLevel: "M",
  });
  const qrImage = await page.doc.embedPng(qrPng);

  // ── Perforations-Hinweis (oberhalb 105mm) ──────────────────────────
  drawDashedLine(page, 0, QR_AREA_H, A4_W, QR_AREA_H);
  page.drawText(TEXT.separateBeforeUse, {
    x: A4_W - 5 * MM - 60,
    y: QR_AREA_H + 1 * MM,
    size: 7,
    font: input.fontRegular,
    color: rgb(0, 0, 0),
  });

  // ── Vertikale Trennlinie zwischen Empfangsschein und Zahlteil ──────
  drawDashedLine(page, RECEIPT_W, 0, RECEIPT_W, QR_AREA_H);

  renderReceipt(page, input);
  await renderPayment(page, input, qrImage);
}

// ─────────────────────────────────────────
// Empfangsschein (links, 62mm breit)
// ─────────────────────────────────────────

function renderReceipt(page: PDFPage, input: QrBillRenderInput): void {
  const x0 = 5 * MM;
  let y = QR_AREA_H - 7 * MM;

  page.drawText(TEXT.receipt, {
    x: x0,
    y,
    size: 11,
    font: input.fontBold,
  });
  y -= 7 * MM;

  // Konto / Zahlbar an
  drawLabelValue(page, input.fontBold, input.fontRegular, x0, y, TEXT.account, [
    formatIbanDisplay(input.iban),
    input.creditor.name,
    input.creditor.street,
    input.creditor.cityLine,
  ], 6, 8);
  y -= 26 * MM;

  // Referenz (nur wenn nicht NON)
  if (input.referenceType !== "NON") {
    drawLabelValue(page, input.fontBold, input.fontRegular, x0, y, TEXT.reference, [
      formatQrReferenceDisplay(input.reference),
    ], 6, 8);
    y -= 8 * MM;
  }

  // Zahlbar durch (oder leeres Kästchen)
  if (input.debtor) {
    drawLabelValue(page, input.fontBold, input.fontRegular, x0, y, TEXT.payableBy, [
      input.debtor.name,
      input.debtor.street,
      input.debtor.cityLine,
    ], 6, 8);
  } else {
    page.drawText(TEXT.payableByEmpty, {
      x: x0, y, size: 6, font: input.fontBold,
    });
    drawEmptyBox(page, x0, y - 18 * MM, 52 * MM, 17 * MM);
  }

  // Bottom: Currency + Amount
  const bottomY = 18 * MM;
  page.drawText(TEXT.currency, {
    x: x0, y: bottomY + 5 * MM, size: 6, font: input.fontBold,
  });
  page.drawText(TEXT.amount, {
    x: x0 + 12 * MM, y: bottomY + 5 * MM, size: 6, font: input.fontBold,
  });
  page.drawText(input.currency, {
    x: x0, y: bottomY, size: 8, font: input.fontRegular,
  });
  if (input.amountCHF != null) {
    page.drawText(formatAmount(input.amountCHF), {
      x: x0 + 12 * MM, y: bottomY, size: 8, font: input.fontRegular,
    });
  } else {
    drawEmptyBox(page, x0 + 12 * MM, bottomY - 1, 30 * MM, 10);
  }

  // Annahmestelle (rechts unten)
  page.drawText(TEXT.acceptance, {
    x: RECEIPT_W - 22 * MM,
    y: 5 * MM,
    size: 6,
    font: input.fontBold,
  });
}

// ─────────────────────────────────────────
// Zahlteil (rechts, 148mm breit)
// ─────────────────────────────────────────

async function renderPayment(
  page: PDFPage,
  input: QrBillRenderInput,
  qrImage: Awaited<ReturnType<PDFPage["doc"]["embedPng"]>>,
): Promise<void> {
  const x0 = RECEIPT_W + 5 * MM;
  let y = QR_AREA_H - 7 * MM;

  page.drawText(TEXT.payment, {
    x: x0,
    y,
    size: 11,
    font: input.fontBold,
  });
  y -= 4 * MM;

  // QR-Code 46×46 mm
  const qrSize = 46 * MM;
  const qrX = x0;
  const qrY = y - qrSize - 1 * MM;
  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });
  // Schweizer Kreuz-Overlay in der Mitte (7×7 mm)
  drawSwissCross(page, qrX + qrSize / 2, qrY + qrSize / 2);

  // Currency + Amount unter QR
  const amountY = qrY - 8 * MM;
  page.drawText(TEXT.currency, {
    x: qrX, y: amountY + 4 * MM, size: 8, font: input.fontBold,
  });
  page.drawText(TEXT.amount, {
    x: qrX + 22 * MM, y: amountY + 4 * MM, size: 8, font: input.fontBold,
  });
  page.drawText(input.currency, {
    x: qrX, y: amountY, size: 10, font: input.fontRegular,
  });
  if (input.amountCHF != null) {
    page.drawText(formatAmount(input.amountCHF), {
      x: qrX + 22 * MM, y: amountY, size: 10, font: input.fontRegular,
    });
  } else {
    drawEmptyBox(page, qrX + 22 * MM, amountY - 1, 40 * MM, 14);
  }

  // ── Rechte Spalte (78 mm breit ab x0+51mm) ──────
  const rightX = x0 + 51 * MM;
  let ry = QR_AREA_H - 7 * MM;
  ry -= 4 * MM; // Anpassung wegen Header-Lücke

  drawLabelValue(page, input.fontBold, input.fontRegular, rightX, ry, TEXT.account, [
    formatIbanDisplay(input.iban),
    input.creditor.name,
    input.creditor.street,
    input.creditor.cityLine,
  ], 8, 10);
  ry -= 32 * MM;

  if (input.referenceType !== "NON") {
    drawLabelValue(page, input.fontBold, input.fontRegular, rightX, ry, TEXT.reference, [
      formatQrReferenceDisplay(input.reference),
    ], 8, 10);
    ry -= 10 * MM;
  }

  if (input.unstructuredMessage) {
    drawLabelValue(page, input.fontBold, input.fontRegular, rightX, ry, TEXT.additionalInfo, [
      input.unstructuredMessage,
    ], 8, 10);
    ry -= 10 * MM;
  }

  if (input.debtor) {
    drawLabelValue(page, input.fontBold, input.fontRegular, rightX, ry, TEXT.payableBy, [
      input.debtor.name,
      input.debtor.street,
      input.debtor.cityLine,
    ], 8, 10);
  } else {
    page.drawText(TEXT.payableByEmpty, {
      x: rightX, y: ry, size: 8, font: input.fontBold,
    });
    drawEmptyBox(page, rightX, ry - 22 * MM, 65 * MM, 21 * MM);
  }
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function drawLabelValue(
  page: PDFPage,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  x: number,
  y: number,
  label: string,
  values: string[],
  labelSize: number,
  valueSize: number,
): void {
  page.drawText(label, { x, y, size: labelSize, font: fontBold });
  let cy = y - labelSize * 1.4;
  const lineHeight = valueSize * 1.3;
  for (const v of values) {
    if (!v) continue;
    page.drawText(v, { x, y: cy, size: valueSize, font: fontRegular });
    cy -= lineHeight;
  }
}

function drawEmptyBox(page: PDFPage, x: number, y: number, w: number, h: number): void {
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
}

function drawDashedLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number): void {
  // pdf-lib unterstützt dash-pattern in drawLine; wir simulieren mit kleinen Strichen.
  const dashLen = 3;
  const gap = 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const total = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.floor(total / (dashLen + gap));
  const ux = dx / total;
  const uy = dy / total;
  for (let i = 0; i < steps; i++) {
    const sx = x1 + ux * i * (dashLen + gap);
    const sy = y1 + uy * i * (dashLen + gap);
    const ex = sx + ux * dashLen;
    const ey = sy + uy * dashLen;
    page.drawLine({
      start: { x: sx, y: sy },
      end: { x: ex, y: ey },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
  }
}

/** Zentriertes Schweizer Kreuz (7×7 mm) als Overlay auf den QR-Code. */
function drawSwissCross(page: PDFPage, cx: number, cy: number): void {
  const size = 7 * MM;
  const half = size / 2;
  // Weisser Hintergrund
  page.drawRectangle({
    x: cx - half - 0.7, y: cy - half - 0.7,
    width: size + 1.4, height: size + 1.4,
    color: rgb(1, 1, 1),
  });
  // Roter Hintergrund (Swiss-Quadrat)
  page.drawRectangle({
    x: cx - half, y: cy - half,
    width: size, height: size,
    color: rgb(1, 0, 0),
  });
  // Weisses Plus
  const armW = 1.5 * MM;
  const armL = 5.0 * MM;
  page.drawRectangle({
    x: cx - armL / 2, y: cy - armW / 2,
    width: armL, height: armW,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({
    x: cx - armW / 2, y: cy - armL / 2,
    width: armW, height: armL,
    color: rgb(1, 1, 1),
  });
}

function formatAmount(n: number): string {
  // Swiss QR-Spec: Apostroph als Tausender, Punkt als Dezimal, 2 Dezimal.
  const fixed = n.toFixed(2);
  const [int, dec] = fixed.split(".");
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${withSep}.${dec}`;
}

export { cityLine };
