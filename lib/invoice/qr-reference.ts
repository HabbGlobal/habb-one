// Schweizer QR-Rechnungs-Referenz.
//
// Spezifikation: Swiss Implementation Guidelines QR-Bill (SIX, Stand 2024).
//
// Format: 27 Ziffern (26 Daten + 1 Prüfziffer Modulo-10-rekursiv).
// Konvention für habb global:
//   • Stellen 1-7: Mandanten-/Firma-ID (auf 7 padded mit Nullen)
//   • Stellen 8-26: Fortlaufende Rechnungs-ID (Cuid-basiert in Ziffern + Padding)
//   • Stelle 27: Prüfziffer
//
// Wichtig:
//   - Beim Anzeigen wird die Referenz in Blöcken zu 5 + 6 + 6 + 6 + 5 dargestellt.
//   - Eingabe/Speicherung: ohne Spaces, 27 Ziffern, nur 0-9.
//
// Dieses Modul ist 100% pure — keine DB.

const MODULO10_LOOKUP = [
  [0, 9, 4, 6, 8, 2, 7, 1, 3, 5],
  [9, 4, 6, 8, 2, 7, 1, 3, 5, 0],
  [4, 6, 8, 2, 7, 1, 3, 5, 0, 9],
  [6, 8, 2, 7, 1, 3, 5, 0, 9, 4],
  [8, 2, 7, 1, 3, 5, 0, 9, 4, 6],
  [2, 7, 1, 3, 5, 0, 9, 4, 6, 8],
  [7, 1, 3, 5, 0, 9, 4, 6, 8, 2],
  [1, 3, 5, 0, 9, 4, 6, 8, 2, 7],
  [3, 5, 0, 9, 4, 6, 8, 2, 7, 1],
  [5, 0, 9, 4, 6, 8, 2, 7, 1, 3],
];

/**
 * Modulo-10 rekursive Prüfziffer-Berechnung (Swiss Standard).
 * @param digits Ziffernfolge (nur 0-9, sonst Exception)
 * @returns Prüfziffer 0..9
 */
export function modulo10Recursive(digits: string): number {
  if (!/^\d+$/.test(digits)) {
    throw new Error("modulo10Recursive: nur Ziffern erlaubt");
  }
  let report = 0;
  for (const ch of digits) {
    const d = parseInt(ch, 10);
    report = MODULO10_LOOKUP[report][d];
  }
  return (10 - report) % 10;
}

/**
 * Generiert eine QR-Referenz aus Firma-ID-Digits + Rechnungs-ID-Digits.
 * Liefert exakt 27 Ziffern.
 */
export function buildQrReference(args: {
  /** 1-7 Ziffern; wird mit Nullen links auf 7 gepadded. */
  companyDigits: string;
  /** 1-19 Ziffern; wird mit Nullen links auf 19 gepadded. */
  invoiceDigits: string;
}): string {
  if (!/^\d+$/.test(args.companyDigits)) {
    throw new Error("companyDigits muss numerisch sein");
  }
  if (!/^\d+$/.test(args.invoiceDigits)) {
    throw new Error("invoiceDigits muss numerisch sein");
  }
  if (args.companyDigits.length > 7) {
    throw new Error("companyDigits zu lang (max 7)");
  }
  if (args.invoiceDigits.length > 19) {
    throw new Error("invoiceDigits zu lang (max 19)");
  }
  const c = args.companyDigits.padStart(7, "0");
  const i = args.invoiceDigits.padStart(19, "0");
  const data = c + i;
  if (data.length !== 26) {
    throw new Error("QR-Reference data muss exakt 26 Ziffern haben");
  }
  const check = modulo10Recursive(data);
  return data + String(check);
}

/**
 * Validiert eine QR-Referenz (27-Stellen mit Prüfziffer).
 */
export function isValidQrReference(ref: string): boolean {
  if (!/^\d{27}$/.test(ref)) return false;
  const data = ref.slice(0, 26);
  const check = ref.slice(26);
  return modulo10Recursive(data) === parseInt(check, 10);
}

/**
 * Formatiert eine QR-Referenz für die menschen-lesbare Anzeige.
 * Standard: Blöcke von rechts nach links zu 5er-Gruppen.
 *   "210000000003139471430009017" → "21 00000 00003 13947 14300 09017"
 */
export function formatQrReferenceDisplay(ref: string): string {
  if (!/^\d{27}$/.test(ref)) return ref;
  // Von rechts in 5er-Blöcken gruppieren
  const reversed = ref.split("").reverse();
  const groups: string[] = [];
  for (let i = 0; i < reversed.length; i += 5) {
    groups.push(reversed.slice(i, i + 5).reverse().join(""));
  }
  return groups.reverse().join(" ");
}

/**
 * Extrahiert nur Ziffern aus einem String. Nützlich um Cuids zu Refs
 * zu mappen (Cuids sind hexadezimal — wir nehmen die ASCII-Codes der
 * Buchstaben als Quelle für zusätzliche Ziffern).
 */
export function digitsFromString(s: string): string {
  let out = "";
  for (const ch of s) {
    if (/\d/.test(ch)) out += ch;
    else out += String(ch.charCodeAt(0) % 10);
  }
  return out;
}

// ─────────────────────────────────────────
// Swiss IBAN / QR-IBAN Helpers
// ─────────────────────────────────────────

/** Entfernt Whitespace und macht uppercase. */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** Validiert die IBAN-Prüfziffer (Modulo-97). */
export function isValidIban(iban: string): boolean {
  const norm = normalizeIban(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(norm)) return false;
  // Re-arrange: ersten 4 Zeichen ans Ende, dann Buchstaben in Zahlen umwandeln
  const rearranged = norm.slice(4) + norm.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    if (/[A-Z]/.test(ch)) {
      numeric += String(ch.charCodeAt(0) - 55); // A=10, B=11, ...
    } else {
      numeric += ch;
    }
  }
  // BigInt mod 97 — JS-Number reicht nicht für 30+ Stellen
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}

/**
 * Prüft ob eine IBAN eine QR-IBAN ist (IID-Bereich 30000-31999 in Stellen 5-9).
 * Nur QR-IBANs dürfen mit QR-Referenz verwendet werden.
 */
export function isQrIban(iban: string): boolean {
  const norm = normalizeIban(iban);
  if (!norm.startsWith("CH") || norm.length !== 21) return false;
  const iid = norm.slice(4, 9);
  if (!/^\d{5}$/.test(iid)) return false;
  const n = parseInt(iid, 10);
  return n >= 30000 && n <= 31999;
}

/** Formatiert eine IBAN für die Anzeige (Blöcke zu 4). */
export function formatIbanDisplay(iban: string): string {
  const norm = normalizeIban(iban);
  return norm.match(/.{1,4}/g)?.join(" ") ?? norm;
}
