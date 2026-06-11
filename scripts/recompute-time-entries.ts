/**
 * Backfill: rechnet die gecachten Aggregate (workedMinutes, breakMinutes,
 * status, firstIn, lastOut) JEDER TimeEntry aus ihren Punches + Breaks neu
 * — exakt mit derselben Logik wie `refreshEntry()` in lib/time/punch.ts +
 * `computeWorkedTime`. Korrigiert Abweichungen und reportet sie.
 *
 * Hintergrund: Pausen müssen von der Arbeitszeit ABGEZOGEN werden (nie
 * dazugezählt). computeWorkedTime macht das korrekt; dieses Script stellt
 * sicher, dass auch alle gecachten Werte konsistent sind.
 *
 * Sicher + idempotent:
 *   - LIVE-Einträge (OPEN/ON_BREAK) werden ÜBERSPRUNGEN (kein Eingriff in
 *     laufende Erfassung).
 *   - Nur abweichende Werte werden geschrieben.
 *
 * `--apply` schreibt; ohne Flag = Dry-Run (nur Report).
 */

import { prisma } from "@/lib/prisma";
import { computeWorkedTime } from "@/lib/time/calc";
import { TimeEntryStatus } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log("──────────────────────────────────────────────");
  console.log(`TimeEntry-Recompute — ${APPLY ? "APPLY (schreibt)" : "DRY-RUN"}`);
  console.log("──────────────────────────────────────────────\n");

  const entries = await prisma.timeEntry.findMany({
    include: {
      punches: true,
      breaks: true,
      employee: { select: { firstName: true, lastName: true, companyId: true } },
    },
  });

  let checked = 0;
  let mismatched = 0;
  let skippedLive = 0;
  const examples: string[] = [];

  for (const e of entries) {
    checked++;
    const result = computeWorkedTime({
      punches: e.punches.map((p) => ({ type: p.type, occurredAt: p.occurredAt })),
      breaks: e.breaks.map((b) => ({ startedAt: b.startedAt, endedAt: b.endedAt })),
      now: new Date(),
    });

    // LIVE (offen / in Pause) → nicht anfassen.
    if (result.isOpen || result.isOnBreak) {
      skippedLive++;
      continue;
    }

    let status: TimeEntryStatus = "EMPTY";
    if (e.punches.length > 0) status = "CLOSED";

    const sorted = [...e.punches].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );
    const firstIn = sorted.find((p) => p.type === "CLOCK_IN")?.occurredAt ?? null;
    const lastOut =
      [...sorted].reverse().find((p) => p.type === "CLOCK_OUT")?.occurredAt ?? null;

    const changed =
      e.workedMinutes !== result.workedMinutes ||
      e.breakMinutes !== result.breakMinutes ||
      e.status !== status ||
      (e.firstIn?.getTime() ?? null) !== (firstIn?.getTime() ?? null) ||
      (e.lastOut?.getTime() ?? null) !== (lastOut?.getTime() ?? null);

    if (!changed) continue;
    mismatched++;

    if (examples.length < 25) {
      const dateStr = e.workDate.toISOString().slice(0, 10);
      examples.push(
        `  ${e.employee.firstName} ${e.employee.lastName} · ${dateStr}: ` +
          `worked ${e.workedMinutes}→${result.workedMinutes}, ` +
          `break ${e.breakMinutes}→${result.breakMinutes}, status ${e.status}→${status}`,
      );
    }

    if (APPLY) {
      await prisma.timeEntry.update({
        where: { id: e.id },
        data: {
          status,
          workedMinutes: result.workedMinutes,
          breakMinutes: result.breakMinutes,
          firstIn,
          lastOut,
        },
      });
    }
  }

  console.log(`Geprüft:        ${checked}`);
  console.log(`Live übersprungen: ${skippedLive}`);
  console.log(`Abweichend:     ${mismatched} ${APPLY ? "(korrigiert)" : "(würden korrigiert)"}`);
  if (examples.length > 0) {
    console.log("\nBeispiele:");
    for (const ex of examples) console.log(ex);
  }
  if (!APPLY && mismatched > 0) {
    console.log("\n→ Mit `--apply` ausführen, um zu schreiben.");
  }
  console.log("\n✓ Fertig.");
}

main()
  .catch((e) => {
    console.error("FEHLER:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
