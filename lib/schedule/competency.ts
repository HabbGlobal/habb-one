// Pure scheduling rules — capacity (max employees per day per area) and
// competency (employee must have area in their competency list before they
// can be planned for it). Kept separate from Prisma so we can unit-test the
// auto-planner without a database.

export interface AreaSpec {
  id: string;
  name: string;
  minEmployeesPerDay?: number | null; // null/0/undefined = no lower bound
  maxEmployeesPerDay: number | null; // null = unlimited
}

export interface EmployeeSpec {
  id: string;
  name: string;
  competencyAreaIds: string[];
  // Per-weekday target hours (Mon=0..Sun=6); 0 = day off.
  weekdayTargets: number[];
}

export interface AbsenceWindow {
  employeeId: string;
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
  reducesTarget: boolean;
}

export interface ExistingEntry {
  employeeId: string;
  date: string; // YYYY-MM-DD
  type: "WORK" | "FREE" | "VACATION" | "SICKNESS" | "ABSENCE" | "HOLIDAY" | "COMPENSATION" | "OTHER";
  workAreaId: string | null;
}

/** Returns true when `employee` is qualified to work in `areaId`. */
export function hasCompetency(employee: EmployeeSpec, areaId: string): boolean {
  return employee.competencyAreaIds.includes(areaId);
}

/** True when `date` (YYYY-MM-DD) lies within the inclusive [start..end] range. */
export function dateInWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function isAbsentOn(
  employeeId: string,
  date: string,
  absences: AbsenceWindow[]
): boolean {
  return absences.some(
    (a) =>
      a.employeeId === employeeId &&
      a.reducesTarget &&
      dateInWindow(date, a.startDate, a.endDate)
  );
}

export interface CapacityViolation {
  kind: "CAPACITY_EXCEEDED";
  areaId: string;
  date: string;
  capacity: number;
  current: number;
}
export interface CompetencyViolation {
  kind: "MISSING_COMPETENCY";
  employeeId: string;
  areaId: string;
}

/**
 * Validates that `employeeId` can be planned in `areaId` on `date` given
 * the area's capacity and the existing entries on that day. Returns a
 * violation, or null if everything's fine.
 *
 *   - excludeEmployeeId: when re-saving an employee's own entry, count
 *     existing entries except theirs (so re-saving doesn't trip capacity).
 */
export function validateAssignment(args: {
  area: AreaSpec;
  employee: EmployeeSpec;
  date: string;
  existingEntries: ExistingEntry[];
  excludeEmployeeId?: string;
}): CapacityViolation | CompetencyViolation | null {
  if (!hasCompetency(args.employee, args.area.id)) {
    return {
      kind: "MISSING_COMPETENCY",
      employeeId: args.employee.id,
      areaId: args.area.id,
    };
  }
  if (args.area.maxEmployeesPerDay != null) {
    const usedSlots = args.existingEntries.filter(
      (e) =>
        e.date === args.date &&
        e.workAreaId === args.area.id &&
        e.type === "WORK" &&
        e.employeeId !== args.excludeEmployeeId
    ).length;
    if (usedSlots + 1 > args.area.maxEmployeesPerDay) {
      return {
        kind: "CAPACITY_EXCEEDED",
        areaId: args.area.id,
        date: args.date,
        capacity: args.area.maxEmployeesPerDay,
        current: usedSlots,
      };
    }
  }
  return null;
}

export interface AutoPlanInput {
  /** Calendar dates (YYYY-MM-DD) to plan for. Caller filters out weekends/holidays. */
  workDates: string[];
  /** Holiday dates (YYYY-MM-DD) — skipped entirely. */
  holidayDates: string[];
  areas: AreaSpec[]; // sorted: limited capacity first, then by name/sortOrder
  employees: EmployeeSpec[];
  absences: AbsenceWindow[];
  /** Already-planned entries (from previous auto-plans or manual edits). */
  existingEntries: ExistingEntry[];
  /** If true, re-distribute days that already have WORK + workAreaId set. */
  overwriteExisting?: boolean;
}

export interface AutoPlanAssignment {
  employeeId: string;
  areaId: string;
  date: string;
}

export interface AutoPlanResult {
  assignments: AutoPlanAssignment[];
  /** Stats per (employee × area) — useful for debugging the load balance. */
  perEmployeeAreaCount: Map<string, Map<string, number>>;
  unfilledSlots: Array<{ areaId: string; date: string; reason: string }>;
}

/**
 * Two-pass auto-planner.
 *
 *   PASS 1 — guarantee minimums: areas with `minEmployeesPerDay > 0` are
 *   filled up to their min FIRST, even if that means leaving a max-1 area
 *   empty for the moment. Areas with the highest min go first so that
 *   high-demand areas never run out of candidates because greedier areas
 *   grabbed all employees.
 *
 *   PASS 2 — fill capacity: process every area again (limited capacity
 *   first) and add candidates up to `maxEmployeesPerDay` (or unbounded).
 *
 * Within each pass, candidates are sorted by their current assignment
 * count for the area (load balancing), tiebroken by name.
 *
 * The function does not write to the DB — it returns a plan the caller
 * applies in a transaction.
 */
export function autoPlan(input: AutoPlanInput): AutoPlanResult {
  const holidays = new Set(input.holidayDates);
  const out: AutoPlanResult = {
    assignments: [],
    perEmployeeAreaCount: new Map(),
    unfilledSlots: [],
  };

  const existingByDate = new Map<string, ExistingEntry[]>();
  for (const e of input.existingEntries) {
    const list = existingByDate.get(e.date) ?? [];
    list.push(e);
    existingByDate.set(e.date, list);
  }

  const incCount = (employeeId: string, areaId: string) => {
    const inner = out.perEmployeeAreaCount.get(employeeId) ?? new Map<string, number>();
    inner.set(areaId, (inner.get(areaId) ?? 0) + 1);
    out.perEmployeeAreaCount.set(employeeId, inner);
  };

  const getCount = (employeeId: string, areaId: string): number =>
    out.perEmployeeAreaCount.get(employeeId)?.get(areaId) ?? 0;

  for (const date of input.workDates) {
    if (holidays.has(date)) continue;

    const dayEntries = existingByDate.get(date) ?? [];
    const lockedToday = new Set<string>();
    // Track how many slots each area already has today.
    const areaCountToday = new Map<string, number>();
    for (const e of dayEntries) {
      if (e.type !== "WORK") {
        lockedToday.add(e.employeeId);
      } else if (e.workAreaId && !input.overwriteExisting) {
        lockedToday.add(e.employeeId);
        areaCountToday.set(e.workAreaId, (areaCountToday.get(e.workAreaId) ?? 0) + 1);
      }
    }

    const present = input.employees.filter(
      (emp) =>
        !isAbsentOn(emp.id, date, input.absences) && !lockedToday.has(emp.id)
    );

    const pickFor = (
      area: AreaSpec,
      desired: number,
      reasonIfEmpty: string
    ): number => {
      const cap = area.maxEmployeesPerDay;
      const have = areaCountToday.get(area.id) ?? 0;
      const headroom = cap == null ? Infinity : Math.max(0, cap - have);
      const target = Math.min(desired, headroom);
      if (target <= 0) return 0;

      const candidates = present
        .filter((emp) => hasCompetency(emp, area.id))
        .filter((emp) => !lockedToday.has(emp.id));

      if (candidates.length === 0) {
        out.unfilledSlots.push({
          areaId: area.id,
          date,
          reason: reasonIfEmpty,
        });
        return 0;
      }

      candidates.sort((a, b) => {
        const ca = getCount(a.id, area.id);
        const cb = getCount(b.id, area.id);
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name);
      });

      const take = Math.min(target, candidates.length);
      for (let i = 0; i < take; i++) {
        const picked = candidates[i];
        out.assignments.push({ employeeId: picked.id, areaId: area.id, date });
        lockedToday.add(picked.id);
        areaCountToday.set(area.id, (areaCountToday.get(area.id) ?? 0) + 1);
        incCount(picked.id, area.id);
      }
      return take;
    };

    // PASS 1 — minimums. Sort by min DESC, then by max ASC (tighter cap first),
    // so the most demanding constraints reserve their employees first.
    const areasWithMin = input.areas
      .filter((a) => (a.minEmployeesPerDay ?? 0) > 0)
      .sort((a, b) => {
        const ma = a.minEmployeesPerDay ?? 0;
        const mb = b.minEmployeesPerDay ?? 0;
        if (mb !== ma) return mb - ma;
        const ca = a.maxEmployeesPerDay ?? Number.MAX_SAFE_INTEGER;
        const cb = b.maxEmployeesPerDay ?? Number.MAX_SAFE_INTEGER;
        return ca - cb;
      });
    for (const area of areasWithMin) {
      const minNeeded = area.minEmployeesPerDay ?? 0;
      const have = areaCountToday.get(area.id) ?? 0;
      const remaining = Math.max(0, minNeeded - have);
      if (remaining === 0) continue;
      const taken = pickFor(
        area,
        remaining,
        `Mindestbesetzung nicht erreicht (${have}/${minNeeded})`
      );
      if (taken < remaining) {
        out.unfilledSlots.push({
          areaId: area.id,
          date,
          reason: `Mindestbesetzung nicht erreicht (${have + taken}/${minNeeded})`,
        });
      }
    }

    // PASS 2 — fill remaining capacity. Limited capacity first, then unlimited.
    const areasByCap = [...input.areas].sort((a, b) => {
      const ca = a.maxEmployeesPerDay ?? Number.MAX_SAFE_INTEGER;
      const cb = b.maxEmployeesPerDay ?? Number.MAX_SAFE_INTEGER;
      return ca - cb;
    });
    for (const area of areasByCap) {
      const cap = area.maxEmployeesPerDay;
      const have = areaCountToday.get(area.id) ?? 0;
      if (cap != null && have >= cap) continue;
      const desired = cap == null ? Number.MAX_SAFE_INTEGER : cap - have;
      pickFor(area, desired, "Keine kompetenten Mitarbeitenden anwesend");
    }
  }

  // Deduplicate unfilledSlots — same area+date might appear twice.
  const seen = new Set<string>();
  out.unfilledSlots = out.unfilledSlots.filter((s) => {
    const k = `${s.areaId}|${s.date}|${s.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return out;
}
