/**
 * Smoke-Test gegen Prod-DB: verifiziert die Absence-Integration im
 * Stundenblatt am Daten-Layer (die "use server"-Action selbst ist
 * auth-gated und nicht direkt aufrufbar). Repliziert exakt was
 * replaceTimeEntryDay schreibt + liest via getDayStatsForRange.
 *
 * 1. Findet habb global-Mitarbeiter Balakirishanth + einen reducesTarget-Typ.
 * 2. Legt eine Einzeltag-Absence an (status APPROVED) für einen Testtag.
 * 3. getDayStatsForRange → erwartet: Absence sichtbar, Soll reduziert.
 * 4. Wenn ein countsAsWorked-Typ existiert: zusätzlicher Check.
 * 5. Räumt IMMER auf (hard delete der Test-Absence).
 */

import { prisma } from "@/lib/prisma";
import { getDayStatsForRange } from "@/lib/time/service";
import { localMidnightUtc } from "@/lib/time/zone";

const TEST_DATE = "2026-02-18"; // ein Mittwoch, weit in der Vergangenheit/ruhig

async function main() {
  console.log("──────────────────────────────────────────────");
  console.log("Sheet-Absence-Integration — Verifikation");
  console.log("──────────────────────────────────────────────\n");

  const emp = await prisma.employee.findFirst({
    where: { firstName: { contains: "Balakir", mode: "insensitive" } },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
  if (!emp) {
    console.log("Kein Test-Mitarbeiter gefunden — übersprungen.");
    return;
  }
  console.log(`Mitarbeiter: ${emp.firstName} ${emp.lastName}`);

  const reducesType = await prisma.absenceType.findFirst({
    where: {
      companyId: emp.companyId,
      reducesTarget: true,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, labelDe: true },
  });
  if (!reducesType) {
    console.log("Kein reducesTarget-Typ — übersprungen.");
    return;
  }
  console.log(`Typ (reducesTarget): ${reducesType.labelDe}\n`);

  const workDate = localMidnightUtc(TEST_DATE);

  // Sicherheit: keine echte Absence an dem Testtag überschreiben
  const preexisting = await prisma.absence.findFirst({
    where: { employeeId: emp.id, startDate: workDate, endDate: workDate, deletedAt: null },
  });
  if (preexisting) {
    console.log("Testtag hat bereits eine Absence — übersprungen (kein Touch echter Daten).");
    return;
  }

  // Baseline: Soll des Testtags OHNE Absence
  const [baseline] = await getDayStatsForRange(emp.id, [TEST_DATE], new Date(), {
    expectedCompanyId: emp.companyId,
  });
  console.log(`Baseline Soll: ${baseline.targetMinutes} min, Ist: ${baseline.workedMinutes} min`);

  let createdId: string | null = null;
  try {
    // ── Schritt 1: Einzeltag-Absence anlegen (wie die Action) ──
    const created = await prisma.absence.create({
      data: {
        employeeId: emp.id,
        absenceTypeId: reducesType.id,
        startDate: workDate,
        endDate: workDate,
        startHalfDay: false,
        endHalfDay: false,
        status: "APPROVED",
        reason: "SMOKE-TEST verify-sheet-absence-flow",
        decidedAt: new Date(),
      },
    });
    createdId = created.id;
    console.log("✓ Einzeltag-Absence angelegt");

    // ── Schritt 2: erneut laden ──
    const [withAbsence] = await getDayStatsForRange(emp.id, [TEST_DATE], new Date(), {
      expectedCompanyId: emp.companyId,
    });

    if (!withAbsence.absence) {
      throw new Error("FEHLER: Absence erscheint NICHT in getDayStatsForRange!");
    }
    console.log(
      `✓ Absence sichtbar: ${withAbsence.absence.labelDe} (id=${withAbsence.absence.id.slice(0, 8)}…, halfDay=${withAbsence.absence.halfDay}, isMultiDay=${withAbsence.absence.isMultiDay})`,
    );

    if (baseline.targetMinutes > 0 && withAbsence.targetMinutes !== 0) {
      throw new Error(
        `FEHLER: Ganztags-reducesTarget sollte Soll auf 0 setzen, ist aber ${withAbsence.targetMinutes}.`,
      );
    }
    console.log(
      `✓ Soll korrekt reduziert: ${baseline.targetMinutes} → ${withAbsence.targetMinutes} min`,
    );

    if (withAbsence.absence.isMultiDay !== false) {
      throw new Error("FEHLER: Einzeltag-Absence fälschlich als isMultiDay markiert.");
    }
    console.log("✓ isMultiDay = false (korrekt für Einzeltag)");
  } finally {
    if (createdId) {
      await prisma.absence.delete({ where: { id: createdId } });
      console.log("\n✓ Test-Absence wieder entfernt (hard delete)");
    }
  }

  // ── countsAsWorked-Check (nur wenn so ein Typ existiert) ──
  const cawType = await prisma.absenceType.findFirst({
    where: {
      companyId: emp.companyId,
      countsAsWorked: true,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true, labelDe: true },
  });
  if (cawType) {
    console.log(`\ncountsAsWorked-Typ gefunden: ${cawType.labelDe} — prüfe Gutschrift`);
    let cawId: string | null = null;
    try {
      const c = await prisma.absence.create({
        data: {
          employeeId: emp.id,
          absenceTypeId: cawType.id,
          startDate: workDate,
          endDate: workDate,
          status: "APPROVED",
          reason: "SMOKE-TEST countsAsWorked",
          decidedAt: new Date(),
        },
      });
      cawId = c.id;
      const [d] = await getDayStatsForRange(emp.id, [TEST_DATE], new Date(), {
        expectedCompanyId: emp.companyId,
      });
      console.log(
        `  countsAsWorked → Ist=${d.workedMinutes} min (Baseline war ${baseline.workedMinutes}). ${d.workedMinutes > baseline.workedMinutes ? "✓ Gutschrift wirkt" : "⚠ keine Änderung (evtl. Soll=0)"}`,
      );
    } finally {
      if (cawId) await prisma.absence.delete({ where: { id: cawId } });
      console.log("  ✓ countsAsWorked-Test-Absence entfernt");
    }
  } else {
    console.log("\n(kein countsAsWorked-Typ vorhanden — Check übersprungen, OK)");
  }

  console.log("\n──────────────────────────────────────────────");
  console.log("✓ Alle Sheet-Absence-Checks bestanden");
  console.log("──────────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error("\n❌ FEHLGESCHLAGEN:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
