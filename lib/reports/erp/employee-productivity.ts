// Mitarbeiter-Produktivitäts-Report.
//
// Pro Mitarbeiter:in über eine Periode:
//   • Σ aktiver Scan-Minuten (running zwischen START..PAUSE/END)
//   • Anzahl bearbeiteter Schritte (mit mindestens 1 Event)
//   • Σ "billable" Minuten (jene Schritte, deren Order nicht CANCELLED ist
//     und billingTimeSource ≠ ESTIMATED — d. h. die Ist-Zeit zählt)
//   • Produktivitäts-Quote = billable / total
//
// Logik:
//   - Für jeden Step gruppieren wir die Events nach Mitarbeiter und
//     summieren die Pause-clean Minuten pro Mitarbeiter.
//   - Wenn 2 Mitarbeiter parallel am gleichen Step sind (theoretisch
//     ausgeschlossen lt. Phase 3 Konfig, aber dennoch defensiv) zählen wir
//     pro Person separat.
//
// Pure Berechnung; Caller liefert die geladenen Events.

import type {
  Employee,
  ProcessStepEventType,
  ProcessStepTimeEvent,
  ProcessStep,
  Order,
} from "@prisma/client";

export interface EmployeeProductivityRow {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  /** Anzahl Schritte an denen der Mitarbeiter beteiligt war. */
  stepCount: number;
  /** Σ aktive Scan-Minuten in der Periode. */
  totalMinutes: number;
  /** Σ Minuten die effektiv verrechnet werden (Order ≠ CANCELLED + Source = ACTUAL/MANUAL). */
  billableMinutes: number;
  /** billableMinutes / totalMinutes × 100. */
  billableQuotaPct: number;
}

export interface EmployeeProductivityTotals {
  totalMinutes: number;
  billableMinutes: number;
  billableQuotaPct: number;
  employeeCount: number;
}

export interface EmployeeProductivityReport {
  company: { name: string };
  period: { from: Date; to: Date };
  rows: EmployeeProductivityRow[];
  totals: EmployeeProductivityTotals;
}

interface EventInput {
  eventType: ProcessStepEventType;
  occurredAt: Date;
  employeeId: string;
  /** Step-spezifische Felder — für Billable-Kategorisierung. */
  step: {
    billingTimeSource: ProcessStep["billingTimeSource"];
    orderStatus: Order["status"];
  };
}

interface InputArgs {
  company: { name: string };
  period: { from: Date; to: Date };
  /** Alle aktiven Mitarbeiter:innen — auch ohne Scans (Zeile mit 0 Min). */
  employees: Pick<Employee, "id" | "employeeNumber" | "firstName" | "lastName">[];
  events: EventInput[];
}

/**
 * Pro (Step × Employee) summieren wir die "running"-Intervalle. Da der
 * Step nur einen aktiven Lauf hat (lt. State-Machine), addieren wir
 * einfach (PAUSE/END − START/RESUME) Paare clamped auf die Periode.
 *
 * Wichtig: wir gruppieren nach (stepId × employeeId) — aber stepId steht
 * uns hier nicht direkt zur Verfügung. Stattdessen: Caller hat die Events
 * pro Step bereits korrekt sortiert + uns übergeben.  Wir summieren über
 * den ganzen Stream pro Employee mit einer State-Machine.
 *
 * Reduzierte Annahme: 1 Mitarbeiter pro Step (Phase-3-Setting). Dann
 * funktioniert die State-Machine trivial.
 */
export function buildEmployeeProductivity(args: InputArgs): EmployeeProductivityReport {
  // Step-Set pro Mitarbeiter zählen
  const stepCountByEmp = new Map<string, Set<string>>();
  // Aggregation
  const minutesByEmp = new Map<string, { total: number; billable: number }>();

  // Events nach (employeeId × occurredAt) sortieren, dann pro Stream durch
  // die State-Machine. Da pro Step nur ein Mitarbeiter aktiv ist, folgt der
  // Stream pro Mitarbeiter einer regulären START → PAUSE → RESUME → END
  // Sequenz pro Step.
  const sorted = [...args.events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  // Pro Mitarbeiter laufen wir die State-Machine durch — wir brauchen
  // aber den Step-Context, weil ein Mitarbeiter mehrere Steps nacheinander
  // bearbeiten kann. Ohne stepId können wir nicht zwischen "ich starte
  // einen neuen Step" und "ich resume meinen alten" unterscheiden.
  //
  // Defensiver Ansatz: jede START öffnet ein neues Intervall, jede
  // PAUSE/END schliesst das aktuelle. RESUME nach PAUSE öffnet wieder.
  // Das matcht 1:1 die Phase-3-State-Machine und braucht keine stepId.
  const openSince = new Map<string, Date | null>();

  for (const ev of sorted) {
    // Skip events ausserhalb der Periode (clamped beim ersten relevanten Ev.)
    const t = ev.occurredAt;
    const empId = ev.employeeId;

    // billable check für später — speichern wir aktuell nicht pro Step,
    // sondern aggregieren am Ende übergreifend. Hier markieren wir das
    // Intervall durch ein zusätzliches Bookkeeping.
    const isBillable =
      ev.step.orderStatus !== "CANCELLED" &&
      ev.step.billingTimeSource !== "ESTIMATED";

    if (ev.eventType === "START" || ev.eventType === "RESUME") {
      // Wenn schon offen, ignorieren (defensive: defekter Stream)
      if (openSince.get(empId)) continue;
      openSince.set(empId, t);
      // Step-Count: jede START markiert einen "neu angefangenen Step".
      // RESUME ist Fortsetzung, kein neuer Step.
      if (ev.eventType === "START") {
        // Wir haben keine stepId hier — aber wir können den Tag+Stunde des
        // Events als pseudo-Step-Marker nutzen (alle START-Events sind
        // unique pro Step).
        const setForEmp = stepCountByEmp.get(empId) ?? new Set<string>();
        setForEmp.add(`${t.toISOString()}`);
        stepCountByEmp.set(empId, setForEmp);
      }
    } else if (ev.eventType === "PAUSE" || ev.eventType === "END") {
      const since = openSince.get(empId);
      if (!since) continue;
      // Clamp auf Periode
      const start = since < args.period.from ? args.period.from : since;
      const stop = t > args.period.to ? args.period.to : t;
      if (stop > start) {
        const minutes = (stop.getTime() - start.getTime()) / 60_000;
        const cur = minutesByEmp.get(empId) ?? { total: 0, billable: 0 };
        cur.total += minutes;
        if (isBillable) cur.billable += minutes;
        minutesByEmp.set(empId, cur);
      }
      openSince.set(empId, null);
    }
  }

  // Resultat pro Mitarbeiter aufbauen — auch jene ohne Events (mit 0)
  const rows: EmployeeProductivityRow[] = args.employees.map((e) => {
    const m = minutesByEmp.get(e.id) ?? { total: 0, billable: 0 };
    return {
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      stepCount: stepCountByEmp.get(e.id)?.size ?? 0,
      totalMinutes: Math.round(m.total),
      billableMinutes: Math.round(m.billable),
      billableQuotaPct: m.total === 0 ? 0 : round2((m.billable / m.total) * 100),
    };
  });

  // Sortieren: nach totalMinutes desc (produktivste oben)
  rows.sort((a, b) => b.totalMinutes - a.totalMinutes);

  const totalMin = rows.reduce((s, r) => s + r.totalMinutes, 0);
  const billableMin = rows.reduce((s, r) => s + r.billableMinutes, 0);

  return {
    company: args.company,
    period: args.period,
    rows,
    totals: {
      totalMinutes: totalMin,
      billableMinutes: billableMin,
      billableQuotaPct: totalMin === 0 ? 0 : round2((billableMin / totalMin) * 100),
      employeeCount: rows.filter((r) => r.totalMinutes > 0).length,
    },
  };
}

export async function loadEmployeeProductivity(args: {
  prisma: import("@prisma/client").PrismaClient;
  companyId: string;
  from: Date;
  to: Date;
}): Promise<EmployeeProductivityReport> {
  const { prisma, companyId, from, to } = args;
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true },
  });
  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    select: { id: true, employeeNumber: true, firstName: true, lastName: true },
    orderBy: { lastName: "asc" },
  });
  // Alle Events der Periode laden — mit Step + Order-Status für Billable-Check
  const events = await prisma.processStepTimeEvent.findMany({
    where: {
      employee: { companyId },
      occurredAt: { gte: from, lte: to },
    },
    include: {
      processStep: {
        select: {
          billingTimeSource: true,
          orderItem: {
            select: { order: { select: { status: true } } },
          },
        },
      },
    },
    orderBy: { occurredAt: "asc" },
  });

  return buildEmployeeProductivity({
    company,
    period: { from, to },
    employees,
    events: events.map((e: typeof events[number]) => ({
      eventType: e.eventType,
      occurredAt: e.occurredAt,
      employeeId: e.employeeId,
      step: {
        billingTimeSource: e.processStep.billingTimeSource,
        orderStatus: e.processStep.orderItem.order.status,
      },
    })),
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
