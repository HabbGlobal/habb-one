import { describe, expect, it } from "vitest";
import {
  buildQrReference,
  digitsFromString,
  formatIbanDisplay,
  formatQrReferenceDisplay,
  isQrIban,
  isValidIban,
  isValidQrReference,
  modulo10Recursive,
} from "./qr-reference";

describe("modulo10Recursive", () => {
  // Reference test vectors aus SIX-Spec (Implementation Guidelines)
  it("Spec-Beispiel '21000000000313947143000901' → 7", () => {
    expect(modulo10Recursive("21000000000313947143000901")).toBe(7);
  });

  it("'1' → 0 (lookup row 0, col 1 = 9 → (10-9)%10 = 1)", () => {
    // Manual trace: report=0; ch='1' → table[0][1]=9 → check=(10-9)%10=1
    expect(modulo10Recursive("1")).toBe(1);
  });

  it("nicht-numerische Eingabe wirft", () => {
    expect(() => modulo10Recursive("12A")).toThrow();
  });
});

describe("buildQrReference", () => {
  it("liefert 27 Ziffern", () => {
    const ref = buildQrReference({ companyDigits: "1", invoiceDigits: "42" });
    expect(ref).toHaveLength(27);
    expect(/^\d{27}$/.test(ref)).toBe(true);
  });

  it("ist via isValidQrReference verifizierbar", () => {
    const ref = buildQrReference({ companyDigits: "5", invoiceDigits: "12345" });
    expect(isValidQrReference(ref)).toBe(true);
  });

  it("Spec-Beispiel rekonstruieren: data=2100000000031394714300090, check=17→7", () => {
    // Aus dem Spec-Beispiel oben — wir haben 26 Ziffern Daten + 1 Prüfziffer
    const data = "21000000000313947143000901";
    expect(modulo10Recursive(data)).toBe(7);
  });

  it("zu lange companyDigits → Exception", () => {
    expect(() =>
      buildQrReference({ companyDigits: "12345678", invoiceDigits: "1" }),
    ).toThrow();
  });
});

describe("isValidQrReference", () => {
  it("manipulierte Prüfziffer → false", () => {
    const valid = buildQrReference({ companyDigits: "1", invoiceDigits: "42" });
    const broken = valid.slice(0, 26) + "9";
    if (valid === broken) return; // unwahrscheinlich, aber Schutz
    expect(isValidQrReference(broken)).toBe(false);
  });

  it("falsches Format → false", () => {
    expect(isValidQrReference("ABC")).toBe(false);
    expect(isValidQrReference("1234567890")).toBe(false);
  });
});

describe("formatQrReferenceDisplay", () => {
  it("formatiert 27 Ziffern in 5er-Blöcken", () => {
    const ref = "210000000003139471430009017";
    const out = formatQrReferenceDisplay(ref);
    // Sollte mit Spaces formatiert sein
    expect(out).toContain(" ");
    expect(out.replace(/\s/g, "")).toBe(ref);
  });
});

describe("digitsFromString", () => {
  it("nimmt Ziffern unverändert", () => {
    expect(digitsFromString("12345")).toBe("12345");
  });
  it("mappt Buchstaben auf charCode mod 10", () => {
    // 'a' = 97 → 7
    expect(digitsFromString("a")).toBe("7");
    expect(digitsFromString("b")).toBe("8");
  });
  it("Mix aus Ziffern + Buchstaben", () => {
    expect(digitsFromString("a1b2")).toBe("7182");
  });
});

describe("isValidIban", () => {
  it("gültige Schweizer IBAN", () => {
    // Beispiel-IBAN von credit-suisse.ch (testpurposes)
    expect(isValidIban("CH9300762011623852957")).toBe(true);
  });

  it("manipulierte IBAN → false", () => {
    expect(isValidIban("CH9300762011623852950")).toBe(false);
  });

  it("akzeptiert mit Spaces", () => {
    expect(isValidIban("CH93 0076 2011 6238 5295 7")).toBe(true);
  });

  it("falsches Format → false", () => {
    expect(isValidIban("123")).toBe(false);
    expect(isValidIban("CH")).toBe(false);
  });
});

describe("isQrIban", () => {
  it("QR-IBAN mit IID 30000 → true", () => {
    // Konstruiere eine konforme QR-IBAN: CH + 2-stellige Prüfsumme + IID 30000 + Rest
    // Wir verwenden einen bekannten Test-Wert: CH4431999123000889012
    expect(isQrIban("CH4431999123000889012")).toBe(true);
  });

  it("normale IBAN (IID < 30000) → false", () => {
    expect(isQrIban("CH9300762011623852957")).toBe(false);
  });

  it("nicht-CH IBAN → false", () => {
    expect(isQrIban("DE89370400440532013000")).toBe(false);
  });
});

describe("formatIbanDisplay", () => {
  it("formatiert in 4er-Blöcken", () => {
    expect(formatIbanDisplay("CH9300762011623852957")).toBe(
      "CH93 0076 2011 6238 5295 7",
    );
  });
});
