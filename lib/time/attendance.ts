// Bulk-Loader für die Admin-Anwesenheits-Übersicht.
//
// Liefert pro aktivem Mitarbeiter:
//   - aktueller Status (IN / BREAK / OUT / ABSENT) + Zeitstempel des
//     letzten Statuswechsels
//   - Heute Ist / Soll (Minuten)
//   - Woche Ist / Soll / Saldo (Minuten)
//   - Wenn ABSENT: Label des Abwesenheitstyps + End-Datum
//
// Single Source of Truth für die Berechnung bleibt
// `getEmployeeKioskSummary` (in `service.ts`) — diese Datei liefert
// pro Mitarbeiter parallel das gleiche Ergebnis wie der Kiosk und
// reichert es mit Status + Abwesenheit an.

import { prisma } from "@/lib/prisma";
import { getEmployeeKioskSummary } from "./service";

export type AttendanceStatus = "IN" | "OUT" | "BREAK" | "ABSENT";

export interface EmployeeAttendance {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  status: AttendanceStatus;
  /** ISO-Zeitpunkt, seit wann der aktuelle Status gilt. Null bei OUT ohne
   *  bisherige Aktivität heute oder ABSENT mit Datums-Granularität. */
  statusSinceIso: string | null;
  todayWorkedMinutes: number;
  todayTargetMinutes: number;
  weekWorkedMinutes: number;
  weekTargetMinutes: number;
  /** worked − target. Positiv = Überstunden. */
  weekBalanceMinutes: number;
  /** Bei ABSENT: deutsches Label des Abwesenheitstyps (Ferien, Krank, …). */
  absenceLabel: string | null;
  /** Bei ABSENT: End-Datum der Abwesenheit (inklusiv), als ISO-Datum. */
  absenceUntilIso: string | null;
}

export interface AttendanceKpis {
  total: number;
  countIn: number;
  countBreak: number;
  countAbsent: number;
  countOut: number;
  /** Summe aller "Heute geleisteten Minuten" über alle aktiven Mitarbeiter. */
  todayWorkedMinutesTotal: number;
}

export interface AttendanceSnapshot {
  generatedAtIso: string;
  employees: EmployeeAttendance[];
  kpis: AttendanceKpis;
}

export async function getCompanyAttendanceSnapshot(
  companyId: string,
  now: Date = new Date(),
): Promise<AttendanceSnapshot> {
  // Tagesgrenzen lokal (für die "seit"-Bestimmung der heutigen
  // TimePunches). Wir nutzen den Server-Process (Europe/Zurich-konfig
  // via Vercel-Region), und akzeptieren dass TimePunch.occurredAt im
  // UTC gespeichert ist — die Filterung gegen `startOfDay/endOfDay`
  // funktioniert in UTC genauso.
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  if (employees.length === 0) {
    return {
      generatedAtIso: now.toISOString(),
      employees: [],
      kpis: {
        total: 0,
        countIn: 0,
        countBreak: 0,
        countAbsent: 0,
        countOut: 0,
        todayWorkedMinutesTotal: 0,
      },
    };
  }

  const employeeIds = employees.map((e) => e.id);

  // Bulk-Queries für Status-Bestimmung. Drei Tabellen, alle parallel —
  // plus parallel pro Mitarbeiter ein getEmployeeKioskSummary.
  const [todayPunches, openBreaks, todayAbsences, summaries] =
    await Promise.all([
      // Heutige Punches — sortiert desc, sodass `find()` immer den
      // jüngsten Eintrag liefert
      prisma.timePunch.findMany({
        where: {
          employeeId: { in: employeeIds },
          occurredAt: { gte: startOfDay, lt: endOfDay },
        },
        select: { employeeId: true, type: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
      }),
      // Aktuell offene Pausen — auf HEUTE begrenzt. Ohne diese Grenze
      // würde ein nie sauber geschlossener BreakEntry aus einem
      // vergangenen Tag (z. B. durch eine manuelle Korrektur, die nur
      // TimePunch statt auch BreakEntry angepasst hat) den Mitarbeiter
      // dauerhaft als "On Break" markieren, unabhängig vom heutigen
      // Stempel-Stand. "Work past midnight" wird ohnehin nicht
      // unterstützt, Pausen beginnen also immer am selben Tag wie sie
      // enden.
      prisma.breakEntry.findMany({
        where: {
          endedAt: null,
          startedAt: { gte: startOfDay, lt: endOfDay },
          timeEntry: { employeeId: { in: employeeIds } },
        },
        select: {
          startedAt: true,
          timeEntry: { select: { employeeId: true } },
        },
      }),
      // Aktive APPROVED-Abwesenheiten von HEUTE
      prisma.absence.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          startDate: { lt: endOfDay },
          endDate: { gte: startOfDay },
          archivedAt: null,
          deletedAt: null,
        },
        include: { absenceType: true },
      }),
      // Pro Mitarbeiter den vollen Kiosk-Summary (gleiche Logik wie der
      // Kiosk selbst). Parallel, deshalb fast so schnell wie eine Query.
      Promise.all(employees.map((e) => getEmployeeKioskSummary(e.id, now))),
    ]);

  // Map-Lookups vorbereiten
  const latestPunchByEmp = new Map<
    string,
    { type: string; occurredAt: Date }
  >();
  const latestClockInByEmp = new Map<string, Date>();
  for (const p of todayPunches) {
    if (!latestPunchByEmp.has(p.employeeId)) {
      latestPunchByEmp.set(p.employeeId, {
        type: p.type,
        occurredAt: p.occurredAt,
      });
    }
    if (p.type === "CLOCK_IN" && !latestClockInByEmp.has(p.employeeId)) {
      latestClockInByEmp.set(p.employeeId, p.occurredAt);
    }
  }

  const openBreakByEmp = new Map<string, Date>();
  for (const b of openBreaks) {
    const empId = b.timeEntry.employeeId;
    if (!openBreakByEmp.has(empId)) {
      openBreakByEmp.set(empId, b.startedAt);
    }
  }

  const absenceByEmp = new Map<
    string,
    (typeof todayAbsences)[number]
  >();
  for (const a of todayAbsences) {
    if (!absenceByEmp.has(a.employeeId)) {
      absenceByEmp.set(a.employeeId, a);
    }
  }

  // Per-Employee-Ergebnis
  const result: EmployeeAttendance[] = employees.map((e, i) => {
    const summary = summaries[i];
    const today = summary.today;
    const absence = absenceByEmp.get(e.id);
    const openBreak = openBreakByEmp.get(e.id);
    const latestClockIn = latestClockInByEmp.get(e.id);
    const latestPunch = latestPunchByEmp.get(e.id);

    let status: AttendanceStatus;
    let statusSinceIso: string | null = null;

    if (absence) {
      status = "ABSENT";
      // Abwesenheit ist datums-basiert; "seit" entspricht startDate.
      statusSinceIso = absence.startDate.toISOString();
    } else if (today?.isOnBreak) {
      // `today.isOnBreak` (aus getEmployeeKioskSummary) ist die
      // Single Source of Truth — frisch aus den heutigen Punches
      // berechnet, siehe Kommentar oben. `openBreak` liefert hier nur
      // noch den "seit"-Zeitstempel für die Anzeige.
      status = "BREAK";
      statusSinceIso = openBreak?.toISOString() ?? null;
    } else if (today?.isOpen) {
      status = "IN";
      statusSinceIso = latestClockIn?.toISOString() ?? null;
    } else {
      status = "OUT";
      statusSinceIso = latestPunch?.occurredAt.toISOString() ?? null;
    }

    return {
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeNumber: e.employeeNumber,
      status,
      statusSinceIso,
      todayWorkedMinutes: today?.workedMinutes ?? 0,
      todayTargetMinutes: today?.targetMinutes ?? 0,
      weekWorkedMinutes: summary.weekTotals.workedMinutes,
      weekTargetMinutes: summary.weekTotals.targetMinutes,
      weekBalanceMinutes: summary.weekTotals.balanceMinutes,
      absenceLabel: absence?.absenceType?.labelDe ?? null,
      absenceUntilIso: absence?.endDate.toISOString() ?? null,
    };
  });

  const kpis: AttendanceKpis = {
    total: result.length,
    countIn: result.filter((r) => r.status === "IN").length,
    countBreak: result.filter((r) => r.status === "BREAK").length,
    countAbsent: result.filter((r) => r.status === "ABSENT").length,
    countOut: result.filter((r) => r.status === "OUT").length,
    todayWorkedMinutesTotal: result.reduce(
      (s, r) => s + r.todayWorkedMinutes,
      0,
    ),
  };

  return {
    generatedAtIso: now.toISOString(),
    employees: result,
    kpis,
  };
}
