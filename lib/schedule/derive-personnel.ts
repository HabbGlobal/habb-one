// Pure Logic: Aus dem Werkstatt-Plan (OrderScheduleEntry) den Personal-
// Bedarf pro Tag pro WorkArea ableiten und konkrete Mitarbeiter-Zuweisungen
// vorschlagen.
//
// Trennung Logik / DB:
//   - Diese Datei macht KEINE Prisma-Queries — Caller lädt alles und übergibt
//     reine Daten. Damit ist die Funktion 1:1 testbar.
//   - Die Server-Action in `app/admin/schedule/actions.ts` ist der einzige
//     Ort, der Daten lädt + die Vorschläge in die DB schreibt.

// ─────────────────────────────────────────
// Inputs (vom Caller)
// ─────────────────────────────────────────

export interface WorkshopBooking {
  /** Datum als YYYY-MM-DD (lokal Europe/Zurich). */
  date: string;
  /** Welche Maschine — wir mappen sie über workAreaId auf einen Bereich. */
  machineId: string;
  /** Dauer in Minuten — bestimmt den Personal-Bedarf. */
  minutes: number;
}

export interface MachineLite {
  id: string;
  /** Wenn null → Maschine löst KEINEN Personal-Bedarf aus (keine WorkArea zugeordnet). */
  workAreaId: string | null;
}

export interface AreaSpec {
  id: string;
  name: string;
  /** Min/Max-Mitarbeiter pro Tag aus der WorkArea-Konfiguration. */
  minEmployeesPerDay: number | null;
  maxEmployeesPerDay: number | null;
}

export interface EmployeeSpec {
  id: string;
  name: string;
  /** WorkArea-IDs, denen der Mitarbeiter zugeordnet ist. */
  areaIds: string[];
}

export interface AbsenceWindow {
  employeeId: string;
  /** YYYY-MM-DD inklusive. */
  startDate: string;
  endDate: string;
}

export interface ExistingScheduleEntry {
  employeeId: string;
  date: string;
  type: string; // ScheduleEntryType
  source: string; // ScheduleEntrySource
  workAreaId: string | null;
}

export interface DeriveOptions {
  /** Wie viele Minuten Werkstatt-Last bedingen einen Mitarbeiter? Default 480 (=8h). */
  minutesPerEmployeePerDay?: number;
  /** Standard-Schicht für neue Personalplan-Einträge. */
  defaultStart?: string; // "07:30"
  defaultEnd?: string; // "16:30"
  defaultBreakMinutes?: number; // 30
  /**
   * Wenn `true`, dürfen bestehende AUTO-Einträge ÜBERSCHRIEBEN werden
   * (z. B. anderer Bereich neu zugewiesen). MANUAL bleibt IMMER tabu.
   */
  overwriteAuto?: boolean;
}

// ─────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────

/** Eine konkrete Personal-Plan-Zuweisung, die der Caller in die DB schreiben soll. */
export interface PersonnelAssignment {
  employeeId: string;
  date: string;
  workAreaId: string;
}

/** Konflikt: irgendwo passt der Bedarf nicht zur Verfügbarkeit. */
export interface PersonnelConflict {
  type:
    | "AREA_UNDERSTAFFED"      // Bedarf > verfügbare Mitarbeiter
    | "AREA_NO_MEMBERS"        // Bereich hat 0 zugeordnete Mitarbeiter
    | "MACHINE_NO_AREA"        // Maschine ohne workAreaId — Last fällt unter den Tisch
    | "OVER_MAX_CAPACITY";     // Bedarf > maxEmployeesPerDay (selten, aber möglich)
  date: string | null;
  areaId: string | null;
  machineId: string | null;
  message: string;
  /** Hinweis: wie viele Mitarbeiter wurden NICHT zugewiesen. */
  shortBy?: number;
}

export interface DeriveResult {
  /** Was tatsächlich neu zu schreiben ist (Caller persistiert). */
  assignments: PersonnelAssignment[];
  /** Was übersprungen wurde, weil bereits ein nicht-überschreibbarer Eintrag existiert. */
  skipped: { employeeId: string; date: string; reason: string }[];
  /** Probleme. */
  conflicts: PersonnelConflict[];
  /** Aufschlüsselung — fürs UI-Vorschau-Modal. */
  summaryByDate: {
    date: string;
    byArea: { areaId: string; areaName: string; demand: number; assigned: number }[];
  }[];
}

// ─────────────────────────────────────────
// Hauptfunktion
// ─────────────────────────────────────────

const DEFAULT_OPTS: Required<DeriveOptions> = {
  minutesPerEmployeePerDay: 480,
  defaultStart: "07:30",
  defaultEnd: "16:30",
  defaultBreakMinutes: 30,
  overwriteAuto: false,
};

export function derivePersonnelFromWorkshop(args: {
  bookings: WorkshopBooking[];
  machines: MachineLite[];
  areas: AreaSpec[];
  employees: EmployeeSpec[];
  absences: AbsenceWindow[];
  existing: ExistingScheduleEntry[];
  options?: DeriveOptions;
}): DeriveResult {
  const opts = { ...DEFAULT_OPTS, ...(args.options ?? {}) };
  const assignments: PersonnelAssignment[] = [];
  const skipped: { employeeId: string; date: string; reason: string }[] = [];
  const conflicts: PersonnelConflict[] = [];

  // Lookups
  const machineById = new Map(args.machines.map((m) => [m.id, m]));
  const areaById = new Map(args.areas.map((a) => [a.id, a]));

  // Mitarbeiter pro Bereich
  const employeesByArea = new Map<string, EmployeeSpec[]>();
  for (const a of args.areas) employeesByArea.set(a.id, []);
  for (const e of args.employees) {
    for (const aid of e.areaIds) {
      employeesByArea.get(aid)?.push(e);
    }
  }
  for (const [aid, list] of employeesByArea) {
    if (list.length === 0) {
      conflicts.push({
        type: "AREA_NO_MEMBERS",
        date: null,
        areaId: aid,
        machineId: null,
        message: `Bereich „${areaById.get(aid)?.name ?? aid}" hat keine zugeordneten Mitarbeiter.`,
      });
    }
  }

  // Bedarf pro (Datum, Bereich) aggregieren
  // demand[date][areaId] = Minuten
  const demand = new Map<string, Map<string, number>>();
  for (const b of args.bookings) {
    const machine = machineById.get(b.machineId);
    if (!machine) continue; // unbekannte Maschine — überspringen
    if (!machine.workAreaId) {
      conflicts.push({
        type: "MACHINE_NO_AREA",
        date: b.date,
        areaId: null,
        machineId: b.machineId,
        message: `Maschine ${b.machineId} ist keinem Bereich zugeordnet — ihre Last fließt nicht in die Personalplanung.`,
      });
      continue;
    }
    const dayMap = demand.get(b.date) ?? new Map();
    dayMap.set(machine.workAreaId, (dayMap.get(machine.workAreaId) ?? 0) + b.minutes);
    demand.set(b.date, dayMap);
  }

  // Existing-Set: was darf nicht überschrieben werden?
  // Key: `${employeeId}|${date}` → entry
  const existingByKey = new Map<string, ExistingScheduleEntry>();
  for (const e of args.existing) {
    existingByKey.set(`${e.employeeId}|${e.date}`, e);
  }

  // Absences pro Mitarbeiter ausrollen
  const absentDays = new Set<string>();
  for (const ab of args.absences) {
    for (const d of dateRange(ab.startDate, ab.endDate)) {
      absentDays.add(`${ab.employeeId}|${d}`);
    }
  }

  // Zähler für Round-Robin-Verteilung pro Bereich
  const assignmentCount = new Map<string, number>(); // key = employeeId
  for (const e of args.employees) assignmentCount.set(e.id, 0);

  // Pro Tag, pro Bereich: Mitarbeiter zuweisen
  const summaryByDate: DeriveResult["summaryByDate"] = [];
  const sortedDates = Array.from(demand.keys()).sort();
  for (const date of sortedDates) {
    const dayDemand = demand.get(date)!;
    const byArea: DeriveResult["summaryByDate"][number]["byArea"] = [];

    // Bereiche sortiert nach Bedarf desc — knappe zuerst, damit min/max-Limits zuverlässig wirken
    const areaIds = Array.from(dayDemand.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([aid]) => aid);

    // Wir merken uns pro Tag, welcher Mitarbeiter schon FIX zugewiesen ist —
    // ein Mitarbeiter darf an einem Tag nur EINMAL eingeplant werden.
    // "Fix" = MANUAL oder COPIED, oder AUTO ohne overwriteAuto-Option.
    const assignedTodayEmps = new Set<string>();
    for (const e of args.existing) {
      if (e.date !== date || e.type !== "WORK") continue;
      const isFixed =
        e.source === "MANUAL" ||
        e.source === "COPIED" ||
        (e.source === "AUTO" && !opts.overwriteAuto);
      if (isFixed) assignedTodayEmps.add(e.employeeId);
    }

    for (const areaId of areaIds) {
      const area = areaById.get(areaId);
      if (!area) continue;
      const minutes = dayDemand.get(areaId) ?? 0;

      // Bedarf in Köpfen — runden hoch
      let needed = Math.max(1, Math.ceil(minutes / opts.minutesPerEmployeePerDay));
      // Min-Belegung des Bereichs (nicht unter Min, auch wenn Bedarf gering)
      if (area.minEmployeesPerDay && area.minEmployeesPerDay > needed) {
        needed = area.minEmployeesPerDay;
      }
      // Max-Belegung darf nicht überschritten werden
      if (area.maxEmployeesPerDay && needed > area.maxEmployeesPerDay) {
        conflicts.push({
          type: "OVER_MAX_CAPACITY",
          date,
          areaId,
          machineId: null,
          message: `${date}: Bereich „${area.name}" — Bedarf ${needed} > Max ${area.maxEmployeesPerDay}.`,
        });
        needed = area.maxEmployeesPerDay;
      }

      // Wie viele schon FIX im Bereich drin (gleiche "fix"-Definition wie oben)?
      const alreadyFixedForArea = args.existing.filter((e) => {
        if (e.date !== date || e.type !== "WORK" || e.workAreaId !== areaId) return false;
        return (
          e.source === "MANUAL" ||
          e.source === "COPIED" ||
          (e.source === "AUTO" && !opts.overwriteAuto)
        );
      }).length;
      let stillNeeded = Math.max(0, needed - alreadyFixedForArea);

      // Kandidaten: Mitarbeiter dieses Bereichs, nicht abwesend, nicht heute schon vergeben,
      // nicht schon mit anderem Eintrag (außer überschreibbarem AUTO).
      const candidates = (employeesByArea.get(areaId) ?? [])
        .filter((emp) => !absentDays.has(`${emp.id}|${date}`))
        .filter((emp) => {
          if (assignedTodayEmps.has(emp.id)) return false;
          const existingEntry = existingByKey.get(`${emp.id}|${date}`);
          if (!existingEntry) return true;
          // Bereits vorhanden — überschreibbar nur wenn AUTO und Option erlaubt es
          if (existingEntry.type !== "WORK" && existingEntry.type !== "FREE") return false;
          if (existingEntry.source === "MANUAL") return false;
          if (existingEntry.source === "AUTO" && !opts.overwriteAuto) return false;
          return true;
        })
        // Last-balanced: wer hat aktuell am wenigsten?
        .sort((a, b) => (assignmentCount.get(a.id) ?? 0) - (assignmentCount.get(b.id) ?? 0));

      let assignedThisArea = 0;
      for (const emp of candidates) {
        if (stillNeeded <= 0) break;
        const existingEntry = existingByKey.get(`${emp.id}|${date}`);
        if (existingEntry) {
          // Überschreiben: zählt nicht als neue Zuweisung im klassischen Sinn,
          // aber wir packen sie in `assignments` (der Caller upsertet).
          skipped.push({
            employeeId: emp.id,
            date,
            reason: `existierender ${existingEntry.source}-Eintrag wird überschrieben`,
          });
        }
        assignments.push({
          employeeId: emp.id,
          date,
          workAreaId: areaId,
        });
        assignedTodayEmps.add(emp.id);
        assignmentCount.set(emp.id, (assignmentCount.get(emp.id) ?? 0) + 1);
        stillNeeded -= 1;
        assignedThisArea += 1;
      }

      if (stillNeeded > 0) {
        conflicts.push({
          type: "AREA_UNDERSTAFFED",
          date,
          areaId,
          machineId: null,
          message: `${date}: „${area.name}" — ${stillNeeded} Mitarbeiter zu wenig (Bedarf ${needed}).`,
          shortBy: stillNeeded,
        });
      }

      byArea.push({
        areaId,
        areaName: area.name,
        demand: needed,
        assigned: alreadyFixedForArea + assignedThisArea,
      });
    }

    summaryByDate.push({ date, byArea });
  }

  return { assignments, skipped, conflicts, summaryByDate };
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function dateRange(startStr: string, endStr: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${startStr}T00:00:00.000Z`);
  const end = new Date(`${endStr}T00:00:00.000Z`);
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
