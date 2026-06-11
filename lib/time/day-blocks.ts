/**
 * Validierung der Zeit-Blöcke im manuellen Stundenblatt-Editor.
 *
 * Modell (Schweizer Praxis, unbezahlte Pausen):
 *   - "Arbeit"-Blöcke = ANWESENHEIT (Kommt–Geht), die gesamte Zeit am
 *     Arbeitsplatz inkl. der Pausen-Zeiträume.
 *   - "Pause"-Blöcke  = unbezahlte Pausen, die INNERHALB der Anwesenheit
 *     liegen und von der Arbeitszeit ABGEZOGEN werden.
 *   - Bezahlte Arbeitszeit = Σ Anwesenheit − Σ Pausen.
 *
 * Pausen DÜRFEN (und sollen) sich mit der Arbeitszeit überschneiden —
 * sie liegen ja darin. Verboten ist nur:
 *   - Arbeit überlappt Arbeit
 *   - Pause überlappt Pause
 *   - Pause liegt NICHT vollständig in einer Arbeitszeit (sonst würde
 *     der Abzug doppelt/falsch zählen)
 *
 * Wird von der Server-Action UND dem Client-Editor genutzt, damit beide
 * Seiten identisch validieren.
 */

/**
 * Block-Typen:
 *   WORK        = Anwesenheit vor Ort
 *   HOME_OFFICE = Anwesenheit im Home Office — rechnerisch IDENTISCH zu
 *                 WORK (zählt als Arbeitszeit), nur zur Unterscheidung.
 *   BREAK       = unbezahlte Pause, liegt innerhalb einer Anwesenheit.
 */
export type DayBlockType = "WORK" | "HOME_OFFICE" | "BREAK";

/** WORK und HOME_OFFICE zählen beide als "Anwesenheit" (Presence). */
export function isPresenceType(t: DayBlockType): boolean {
  return t === "WORK" || t === "HOME_OFFICE";
}

export interface DayBlockInput {
  type: DayBlockType;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Gibt eine deutsche Fehlermeldung zurück oder `null`, wenn die Blöcke
 * gültig sind. Leere Block-Liste (= Leer-Tag) ist gültig.
 */
export function validateDayBlocks(blocks: DayBlockInput[]): string | null {
  // 1) Format + Beginn < Ende
  for (const b of blocks) {
    if (!HHMM.test(b.start)) return `Ungültige Beginn-Zeit: „${b.start}".`;
    if (!HHMM.test(b.end)) return `Ungültige Ende-Zeit: „${b.end}".`;
    if (b.start >= b.end) {
      return `Ende muss nach Beginn liegen (${b.start}–${b.end}).`;
    }
  }

  // Presence = WORK + HOME_OFFICE (beide zählen als Anwesenheit).
  const work = blocks
    .filter((b) => isPresenceType(b.type))
    .sort((a, b) => a.start.localeCompare(b.start));
  const breaks = blocks
    .filter((b) => b.type === "BREAK")
    .sort((a, b) => a.start.localeCompare(b.start));

  // 2) Anwesenheiten (Arbeit/Home Office) dürfen sich nicht überlappen
  for (let i = 0; i < work.length - 1; i++) {
    if (work[i].end > work[i + 1].start) {
      return `Arbeitszeiten überlappen sich: ${work[i].start}–${work[i].end} und ${work[i + 1].start}–${work[i + 1].end}.`;
    }
  }

  // 3) Jede Pause muss vollständig innerhalb einer Arbeitszeit liegen
  for (const br of breaks) {
    const within = work.some(
      (w) => br.start >= w.start && br.end <= w.end,
    );
    if (!within) {
      if (work.length === 0) {
        return `Pause ${br.start}–${br.end} ohne Arbeitszeit — bitte zuerst die Arbeitszeit (Anwesenheit) erfassen.`;
      }
      return `Die Pause ${br.start}–${br.end} muss innerhalb einer Arbeitszeit liegen.`;
    }
  }

  // 4) Pausen dürfen sich nicht gegenseitig überlappen
  for (let i = 0; i < breaks.length - 1; i++) {
    if (breaks[i].end > breaks[i + 1].start) {
      return `Pausen überlappen sich: ${breaks[i].start}–${breaks[i].end} und ${breaks[i + 1].start}–${breaks[i + 1].end}.`;
    }
  }

  return null;
}
