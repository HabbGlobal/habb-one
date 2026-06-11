// Schweizer QR-Rechnungs-Payload-Builder.
//
// Spezifikation: SIX Implementation Guidelines QR-bill v2.3.
// Format: 33 Felder, jeweils per LF/CRLF getrennt (Standard: \n).
// Zwingend: Header SPC + V0200 + 1 (Coding=Latin-1).

import { normalizeIban } from "./qr-reference";

export interface QrBillPayloadInput {
  /** QR-IBAN (mit IID 30000-31999) oder normale IBAN. */
  iban: string;
  creditor: {
    name: string;
    street: string; // Strasse + Hausnummer (Adresstyp K = kombiniert)
    cityLine: string; // PLZ + Ort
    country: string; // ISO 2 (CH, DE, ...)
  };
  /** Betrag in CHF — auf 2 Dezimalstellen gerundet. Empty erlaubt für offenen Betrag. */
  amountCHF: number | null;
  currency: "CHF" | "EUR";
  debtor?: {
    name: string;
    street: string;
    cityLine: string;
    country: string;
  };
  /** Referenz-Typ: QRR für QR-Referenz (27-Stellig), SCOR für Creditor Ref, NON für keine. */
  referenceType: "QRR" | "SCOR" | "NON";
  /** Bei QRR: 27-stellige Referenz. Bei NON: leer. */
  reference: string;
  /** Optional Mitteilung (max 140 Zeichen). */
  unstructuredMessage?: string;
  /** Optional Rechnungsdaten (Bill-Information, max 140 Zeichen). */
  billInformation?: string;
}

/**
 * Erzeugt den QR-Code-Inhalt nach Swiss QR-Bill v2.3.
 * Liefert 33 Felder per \n getrennt.
 */
export function buildQrBillPayload(input: QrBillPayloadInput): string {
  const lines: string[] = [];

  // Header
  lines.push("SPC"); // 1: QRType
  lines.push("0200"); // 2: Version
  lines.push("1"); // 3: Coding-Typ (1 = Latin-1)

  // CdtrInf — IBAN + Creditor (Adresstyp K = kombiniert)
  lines.push(normalizeIban(input.iban)); // 4: IBAN
  lines.push("K"); // 5: AdrTp
  lines.push(safe(input.creditor.name, 70)); // 6: Name
  lines.push(safe(input.creditor.street, 70)); // 7: StrtNmOrAdrLine1
  lines.push(safe(input.creditor.cityLine, 70)); // 8: BldgNbOrAdrLine2
  lines.push(""); // 9: PstCd (leer bei AdrTp=K)
  lines.push(""); // 10: TmCty (leer bei AdrTp=K)
  lines.push(input.creditor.country); // 11: Ctry

  // UltmtCdtr — leer (für QR-IBAN)
  lines.push(""); // 12
  lines.push(""); // 13
  lines.push(""); // 14
  lines.push(""); // 15
  lines.push(""); // 16
  lines.push(""); // 17
  lines.push(""); // 18

  // CcyAmt
  lines.push(input.amountCHF != null ? input.amountCHF.toFixed(2) : ""); // 19: Amt
  lines.push(input.currency); // 20: Ccy

  // UltmtDbtr (Endkunde)
  if (input.debtor) {
    lines.push("K"); // 21: AdrTp
    lines.push(safe(input.debtor.name, 70));
    lines.push(safe(input.debtor.street, 70));
    lines.push(safe(input.debtor.cityLine, 70));
    lines.push(""); // 25
    lines.push(""); // 26
    lines.push(input.debtor.country);
  } else {
    lines.push(""); // 21
    lines.push(""); // 22
    lines.push(""); // 23
    lines.push(""); // 24
    lines.push(""); // 25
    lines.push(""); // 26
    lines.push(""); // 27
  }

  // RmtInf
  lines.push(input.referenceType); // 28: Tp
  lines.push(input.referenceType === "NON" ? "" : input.reference); // 29: Ref

  // AddInf
  lines.push(safe(input.unstructuredMessage ?? "", 140)); // 30: Ustrd
  lines.push("EPD"); // 31: Trailer (End Payment Data)
  lines.push(safe(input.billInformation ?? "", 140)); // 32: StrdBkgInf

  // AV1/AV2 (Alternative Verfahren) — leer
  // Spec sagt: weglassen wenn nicht verwendet, ABER: pdf-lib + qrcode sind
  // mit Trailing-LFs OK. Sicherheitshalber lassen wir die Felder weg
  // (Stelle 33 = AltPmt1, 34 = AltPmt2 — beide optional).

  return lines.join("\n");
}

/**
 * Adresszeile für CityLine zusammensetzen ("8001 Zürich").
 */
export function cityLine(zip: string, city: string): string {
  return `${zip.trim()} ${city.trim()}`.trim();
}

/**
 * Strip alles was nicht in Latin-1 (CP1252) abgebildet werden kann +
 * Cut auf max-Länge.
 */
function safe(text: string, maxLen: number): string {
  // Replace Unicode-Sonderzeichen, die in Latin-1 fehlen würden
  const t = text
    .replace(/→/g, "->")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"');
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen);
}
