/**
 * Validation of time blocks in the manual timesheet editor.
 *
 * Model (Swiss practice, unpaid breaks):
 *   - "Work" blocks = PRESENCE (Arrival–Departure), the entire time at
 *     the workplace including break periods.
 *   - "Break" blocks = unpaid breaks that are WITHIN the presence
 *     and are DEDUCTED from working time.
 *   - Paid working time = Σ Presence − Σ Breaks.
 *
 * Breaks MAY (and should) overlap with working time —
 * they are contained within it. Forbidden is only:
 *   - Work overlaps work
 *   - Break overlaps break
 *   - Break is NOT entirely within a working time (otherwise the
 *     deduction would count double/incorrectly)
 *
 * Used by the server action AND the client editor so both
 * sides validate identically.
 */

/**
 * Block types:
 *   WORK        = Presence on site
 *   HOME_OFFICE = Presence in home office — computationally IDENTICAL to
 *                 WORK (counts as working time), only for distinction.
 *   BREAK       = unpaid break, within a presence period.
 */
export type DayBlockType = "WORK" | "HOME_OFFICE" | "BREAK";

/** WORK and HOME_OFFICE both count as "Presence". */
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
 * Returns an error message or `null` if the blocks are valid.
 * Empty block list (= empty day) is valid.
 */
export function validateDayBlocks(blocks: DayBlockInput[]): string | null {
  // 1) Format + start < end
  for (const b of blocks) {
    if (!HHMM.test(b.start)) return `Invalid start time: "${b.start}".`;
    if (!HHMM.test(b.end)) return `Invalid end time: "${b.end}".`;
    if (b.start >= b.end) {
      return `End must be after start (${b.start}–${b.end}).`;
    }
  }

  // Presence = WORK + HOME_OFFICE (both count as presence).
  const work = blocks
    .filter((b) => isPresenceType(b.type))
    .sort((a, b) => a.start.localeCompare(b.start));
  const breaks = blocks
    .filter((b) => b.type === "BREAK")
    .sort((a, b) => a.start.localeCompare(b.start));

  // 2) Presences (work/home office) must not overlap
  for (let i = 0; i < work.length - 1; i++) {
    if (work[i].end > work[i + 1].start) {
      return `Working times overlap: ${work[i].start}–${work[i].end} and ${work[i + 1].start}–${work[i + 1].end}.`;
    }
  }

  // 3) Each break must be entirely within a working time
  for (const br of breaks) {
    const within = work.some(
      (w) => br.start >= w.start && br.end <= w.end,
    );
    if (!within) {
      if (work.length === 0) {
        return `Break ${br.start}–${br.end} without working time — please enter working time (presence) first.`;
      }
      return `Break ${br.start}–${br.end} must be within a working time.`;
    }
  }

  // 4) Breaks must not overlap each other
  for (let i = 0; i < breaks.length - 1; i++) {
    if (breaks[i].end > breaks[i + 1].start) {
      return `Breaks overlap: ${breaks[i].start}–${breaks[i].end} and ${breaks[i + 1].start}–${breaks[i + 1].end}.`;
    }
  }

  return null;
}
