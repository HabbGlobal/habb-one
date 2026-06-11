/**
 * Defensive Unicode-zu-WinAnsi-Mapping für pdf-lib StandardFonts.
 *
 * pdf-lib bettet `StandardFonts.Helvetica` mit WinAnsi-Encoding ein. Das
 * deckt nur Latin-1 + ein paar Sonderzeichen (€, …, smart quotes) ab.
 * Jeder Codepoint > 0xFF — also Emojis (⚠, ✓, …), CJK, Pfeile —
 * lässt `drawText` mit einer Exception sterben:
 *
 *   "WinAnsi cannot encode \"⚠\" (0x26a0)"
 *
 * Bisher hatten `lib/invoice/pdf.ts` und `lib/order/traveler-pdf.ts` je
 * eine eigene `safe()`-Funktion mit unterschiedlichen Mappings. Wenn
 * irgendwo ein neues Zeichen reinrutschte, kam erst beim User der Crash.
 *
 * Jetzt: zentrale Funktion mit zwei Phasen:
 *   1. Bekannte Sonderzeichen auf ASCII-Equivalente mappen
 *   2. Final-Guard: jeder verbleibende Codepoint > 0xFF wird zu "?"
 *      (statt drawText-Exception)
 */

const REPLACEMENTS: Array<[RegExp, string]> = [
  // Pfeile
  [/→/g, "->"],
  [/←/g, "<-"],
  [/↑/g, "^"],
  [/↓/g, "v"],
  [/⇒/g, "=>"],
  [/⇐/g, "<="],

  // Status-Symbole
  [/✓/g, "OK"],
  [/✗/g, "X"],
  [/✘/g, "X"],
  [/✕/g, "X"],
  [/●/g, "*"],
  [/◯/g, "o"],
  [/■/g, "#"],
  [/□/g, "[]"],

  // Warn-/Hinweis-Symbole — werden zu ASCII-Markern, damit die Semantik
  // (Aufmerksamkeit erzeugen) erhalten bleibt.
  [/⚠/g, "!"],
  [/⚡/g, "!"],
  [/❗/g, "!"],
  [/❕/g, "!"],
  [/ℹ/g, "i"],
  [/❓/g, "?"],
  [/❔/g, "?"],

  // Diverse Striche
  [/[‐‑‒–—―]/g, "-"],

  // Quotes
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],

  // Diverse Symbole — WinAnsi hat einige davon (z.B. €, ™) zwar im
  // 0x80-0x9F-Bereich, aber wir mappen sie defensiv auf ASCII damit der
  // Final-Guard sie nicht fälschlich strippt.
  [/€/g, "EUR"],
  [/™/g, "(TM)"],
  [/®/g, "(R)"],
  [/©/g, "(C)"],
  [/[•]/g, "*"],
  [/…/g, "..."],
  [/[‹›]/g, "'"],
];

/**
 * Bereitet einen String für pdf-lib `drawText` vor. Garantiert WinAnsi-
 * kompatibel; ersetzt unbekannte Codepoints > 0xFF durch "?".
 */
export function safeWinAnsi(input: string): string {
  let out = input;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Final-Guard: alles was nach den Mappings noch außerhalb Latin-1 liegt,
  // strippen statt drawText crashen lassen. Wir loggen den Fund einmal,
  // damit man in CI/Vercel-Logs den Pfad sieht und das Mapping ergänzen
  // kann.
  return out.replace(/[Ā-￿]/g, (ch) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[safeWinAnsi] Replaced non-WinAnsi codepoint 0x${ch.charCodeAt(0).toString(16)} with "?"`,
    );
    return "?";
  });
}
