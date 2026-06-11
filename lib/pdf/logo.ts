// Helper: Firmen-Logo in PDFs einbetten.
//
// Das Logo wird in der DB als Bytes (`Company.logoData`) + MimeType
// (`Company.logoMimeType`, "image/png" oder "image/jpeg") gespeichert.
// Hier eingebettet pro PDF, mit fester Box-Größe (Standard 35mm breit,
// Höhe automatisch aus Aspect-Ratio).
//
// Verwendung in einem PDF-Generator:
//   const logo = await embedCompanyLogo(doc, company);
//   if (logo) drawCompanyLogo(page, logo, { x, y, maxWidthMm: 35, maxHeightMm: 18 });

import { PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";

const MM_TO_PT = 2.83465;

export interface EmbeddedLogo {
  image: PDFImage;
  /** Native Bild-Breite in pdf-lib-Punkten. */
  nativeWidth: number;
  /** Native Bild-Höhe in pdf-lib-Punkten. */
  nativeHeight: number;
}

/**
 * Bettet das Firmen-Logo in das PDFDocument ein. Returns null wenn
 * kein Logo gespeichert ist oder das Format unbekannt.
 *
 * Akzeptiert das `Company`-Objekt direkt aus Prisma — wir lesen nur
 * `logoData` und `logoMimeType`. Bytes werden zu Uint8Array konvertiert,
 * was pdf-lib intern erwartet.
 */
export async function embedCompanyLogo(
  doc: PDFDocument,
  company: { logoData: Uint8Array | Buffer | null; logoMimeType: string | null },
): Promise<EmbeddedLogo | null> {
  if (!company.logoData || !company.logoMimeType) return null;

  const bytes =
    company.logoData instanceof Uint8Array
      ? company.logoData
      : new Uint8Array(company.logoData as Buffer);

  let image: PDFImage;
  try {
    if (company.logoMimeType === "image/png") {
      image = await doc.embedPng(bytes);
    } else if (
      company.logoMimeType === "image/jpeg" ||
      company.logoMimeType === "image/jpg"
    ) {
      image = await doc.embedJpg(bytes);
    } else {
      return null;
    }
  } catch {
    // Korruptes/falsches Format → still ignorieren statt PDF crashen
    return null;
  }

  return {
    image,
    nativeWidth: image.width,
    nativeHeight: image.height,
  };
}

/**
 * Zeichnet das Logo in eine Box. Die Box wird mit korrekter
 * Aspect-Ratio gefüllt (kontain, nicht verzerrt).
 *
 * `x`/`y` sind in pdf-lib-Punkten (Origin unten-links auf der Page).
 * `maxWidthMm` / `maxHeightMm` definieren die Maximal-Box in Millimetern.
 *
 * Für oben-rechts-Position auf A4: `x = pageWidth - maxWidthPt - marginPt`,
 *                                  `y = pageHeight - maxHeightPt - marginPt`.
 */
export function drawCompanyLogo(
  page: PDFPage,
  logo: EmbeddedLogo,
  opts: { x: number; y: number; maxWidthMm: number; maxHeightMm: number },
): { drawnWidth: number; drawnHeight: number } {
  const maxW = opts.maxWidthMm * MM_TO_PT;
  const maxH = opts.maxHeightMm * MM_TO_PT;
  const aspect = logo.nativeWidth / logo.nativeHeight;

  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  page.drawImage(logo.image, {
    x: opts.x,
    y: opts.y,
    width: w,
    height: h,
  });

  return { drawnWidth: w, drawnHeight: h };
}

/**
 * Convenience: oben-rechts ins PDF setzen, mit Standard-Margin.
 * Returns die gezeichnete Höhe damit Caller den Text-Baseline-Offset kennt.
 */
export function drawCompanyLogoTopRight(
  page: PDFPage,
  logo: EmbeddedLogo,
  opts?: { maxWidthMm?: number; maxHeightMm?: number; marginMm?: number },
): { drawnWidth: number; drawnHeight: number } {
  const maxWidthMm = opts?.maxWidthMm ?? 35;
  const maxHeightMm = opts?.maxHeightMm ?? 18;
  const marginMm = opts?.marginMm ?? 15;
  const margin = marginMm * MM_TO_PT;
  const maxW = maxWidthMm * MM_TO_PT;
  const maxH = maxHeightMm * MM_TO_PT;

  const { width: pageW, height: pageH } = page.getSize();

  return drawCompanyLogo(page, logo, {
    x: pageW - maxW - margin,
    y: pageH - maxH - margin,
    maxWidthMm,
    maxHeightMm,
  });
}
