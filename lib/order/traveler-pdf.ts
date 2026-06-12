// Workshop traveler: One page (A4) per order with all process steps
// and a real QR code per step. Employees scan with their phone
// → opens `/scan/<stepId>`.
//
// Target audience: Workshop — robust, large print, clear structure. Travels
// together with the workpiece on the workshop cart.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { OrderDetailDTO } from "@/lib/dto/order";
import { embedCompanyLogo, drawCompanyLogoTopRight } from "@/lib/pdf/logo";
import {
  processLabel,
  machineLabel,
  skillLabel,
  materialLabel,
  complexityLabel,
  stepStatusLabel,
} from "@/lib/order/labels";

import { safeWinAnsi as safe } from "@/lib/pdf/safe-text";

const A4 = { w: 595.28, h: 841.89 };

interface BuildArgs {
  company: {
    name: string;
    logoData?: Uint8Array | Buffer | null;
    logoMimeType?: string | null;
  };
  order: OrderDetailDTO;
  /** Base URL of the app (e.g. "https://one.HABB Global (PVT) LTD") — Scan link becomes
   *  `<base>/scan/<stepId>`. If not set, falls back to relative URL. */
  appBaseUrl?: string;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtMin(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/**
 * Generates a QR-PNG (Buffer) for the given URL.
 * QRCode lib produces a PNG Buffer that pdf-lib can embed directly.
 */
async function generateQrPng(url: string, sizePx: number): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    width: sizePx,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export async function travelerPdf(args: BuildArgs): Promise<Uint8Array> {
  const { company, order, appBaseUrl = "" } = args;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logo = await embedCompanyLogo(doc, {
    logoData: company.logoData ?? null,
    logoMimeType: company.logoMimeType ?? null,
  });

  let page = doc.addPage([A4.w, A4.h]);
  if (logo) drawCompanyLogoTopRight(page, logo);
  let y = drawHeader(page, font, fontBold, company, order);

  // Collect all steps from all items
  const steps: Array<{
    stepId: string;
    label: string;
    sequence: number;
    machineLabel: string;
    skillLabel: string;
    estimatedMinutes: number;
    actualMinutes: number | null;
    status: string;
    itemPos: number;
    itemDesc: string;
    itemMaterial: string;
    itemComplexity: string;
    itemSurfaceM2: number;
    itemQuantity: number;
  }> = [];
  for (const it of order.items) {
    for (const s of it.processSteps) {
      steps.push({
        stepId: s.id,
        label: processLabel(s.processCode),
        sequence: s.sequence,
        machineLabel: machineLabel(s.machineTypeRequired),
        skillLabel: skillLabel(s.skillRequired),
        estimatedMinutes: s.estimatedMinutes,
        actualMinutes: s.actualMinutes,
        status: stepStatusLabel(s.status),
        itemPos: it.position,
        itemDesc: it.description,
        itemMaterial: materialLabel(it.material),
        itemComplexity: complexityLabel(it.complexity),
        itemSurfaceM2: it.surfaceM2,
        itemQuantity: it.quantity,
      });
    }
  }

  // Pre-generate QR codes in parallel (otherwise slow with many steps).
  const qrSize = 110;
  const qrPngs = await Promise.all(
    steps.map((s) => generateQrPng(`${appBaseUrl}/scan/${s.stepId}`, qrSize * 4)),
  );

  // Layout: Pro Schritt eine Zeile, Höhe ~ qrSize + Padding.
  const ROW_HEIGHT = qrSize + 28;
  const CONTENT_X = 40;
  const QR_X = A4.w - 40 - qrSize;

  let currentItemPos: number | null = null;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (y - ROW_HEIGHT < 60) {
      page = doc.addPage([A4.w, A4.h]);
      if (logo) drawCompanyLogoTopRight(page, logo);
      y = drawHeader(page, font, fontBold, company, order, /*continuation*/ true);
    }

    // Item separator when a new position starts
    if (s.itemPos !== currentItemPos) {
      currentItemPos = s.itemPos;
      page.drawText(safe(`Pos. ${s.itemPos} - ${s.itemDesc}`), {
        x: CONTENT_X,
        y,
        size: 11,
        font: fontBold,
      });
      y -= 14;
      page.drawText(
        safe(
          `${s.itemQuantity}x · ${s.itemSurfaceM2} m² · ${s.itemMaterial} · ${s.itemComplexity}`,
        ),
        {
          x: CONTENT_X,
          y,
          size: 8,
          font,
          color: rgb(0.4, 0.4, 0.4),
        },
      );
      y -= 12;
      page.drawLine({
        start: { x: CONTENT_X, y },
        end: { x: A4.w - 40, y },
        color: rgb(0.7, 0.7, 0.7),
        thickness: 0.5,
      });
      y -= 10;
    }

    // QR code right
    const qrImage = await doc.embedPng(qrPngs[i]);
    page.drawImage(qrImage, {
      x: QR_X,
      y: y - qrSize + 8,
      width: qrSize,
      height: qrSize,
    });

    // Step content left
    const stepTop = y;
    page.drawText(safe(`${s.sequence}.  ${s.label}`), {
      x: CONTENT_X,
      y: stepTop,
      size: 14,
      font: fontBold,
    });
    page.drawText(safe(`Machine: ${s.machineLabel}`), {
      x: CONTENT_X,
      y: stepTop - 18,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText(safe(`Worker: ${s.skillLabel}`), {
      x: CONTENT_X,
      y: stepTop - 30,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText(safe(`Estimated: ${fmtMin(s.estimatedMinutes)}`), {
      x: CONTENT_X,
      y: stepTop - 46,
      size: 10,
      font: fontBold,
    });
    if (s.actualMinutes != null) {
      page.drawText(safe(`Actual: ${fmtMin(s.actualMinutes)}`), {
        x: CONTENT_X + 130,
        y: stepTop - 46,
        size: 10,
        font: fontBold,
        color: rgb(0.1, 0.5, 0.1),
      });
    }
    page.drawText(safe(`Status: ${s.status}`), {
      x: CONTENT_X,
      y: stepTop - 60,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Note text next to QR
    page.drawText(safe("Scan with phone"), {
      x: QR_X + 4,
      y: y - qrSize - 2,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    y -= ROW_HEIGHT;
  }

  // Footer
  page.drawText(
    safe(
      "Workshop traveler — please keep with the workpiece. " +
      "At the start of each step: scan QR -> Start. " +
      "When finishing: scan QR -> Complete.",
    ),
    {
      x: 40,
      y: 30,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.5),
    },
  );

  return doc.save();
}

function drawHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  company: { name: string },
  order: OrderDetailDTO,
  continuation = false,
): number {
  const { width, height } = page.getSize();
  page.drawText(safe(company.name), {
    x: 40,
    y: height - 40,
    size: 12,
    font: fontBold,
  });
  page.drawText(safe("Workshop Traveler" + (continuation ? " (continued)" : "")), {
    x: 40,
    y: height - 60,
    size: 18,
    font: fontBold,
  });
  page.drawText(safe(order.orderNumber), {
    x: width - 200,
    y: height - 40,
    size: 14,
    font: fontBold,
  });
  // Customer name truncated to 35 chars to fit in the header.
  const custName = order.customerDisplayName.length > 35
    ? order.customerDisplayName.slice(0, 33) + "…"
    : order.customerDisplayName;
  page.drawText(safe(custName), {
    x: width - 200,
    y: height - 56,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText(safe(`Delivery date: ${fmtDate(order.promisedAt)}`), {
    x: width - 200,
    y: height - 70,
    size: 9,
    font,
  });
  page.drawLine({
    start: { x: 40, y: height - 90 },
    end: { x: width - 40, y: height - 90 },
    color: rgb(0.6, 0.6, 0.6),
    thickness: 0.7,
  });
  return height - 110;
}
