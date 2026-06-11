// Maschinen-Auslastungs-Report.
//
// Pro Maschine über eine Periode:
//   • verfügbare Arbeitsstunden (aus workingHours, abzügl. Holidays + Wartung)
//   • gebuchte Stunden (Σ OrderScheduleEntry-Dauern)
//   • Auslastung in % = booked / available
//
// Wir nutzen den bestehenden Calendar-Helper aus dem Scheduler.

import { workWindowsForDay, parseWorkingHours } from "@/lib/scheduler/calendar";
import { formatInTimeZone } from "date-fns-tz";
import { ZONE } from "@/lib/time/zone";
import type {
  Machine,
  MachineMaintenance,
  OrderScheduleEntry,
  Holiday,
  Order,
  Customer,
} from "@prisma/client";

export interface MachineUtilizationRow {
  machineId: string;
  machineName: string;
  machineType: Machine["type"];
  /** Σ verfügbare Minuten in der Periode. */
  availableMinutes: number;
  /** Σ gebuchte Minuten (überlappungs-clamped auf die Periode). */
  bookedMinutes: number;
  utilizationPct: number;
  /** Anzahl gebuchter Slots in der Periode. */
  bookingCount: number;
}

export interface MachineUtilizationTotals {
  availableMinutes: number;
  bookedMinutes: number;
  utilizationPct: number;
}

export interface MachineUtilizationReport {
  company: { name: string };
  period: { from: Date; to: Date };
  rows: MachineUtilizationRow[];
  totals: MachineUtilizationTotals;
}

type MachineWithBookings = Machine & {
  maintenanceWindows: MachineMaintenance[];
  scheduleEntries: (OrderScheduleEntry & {
    order?: Pick<Order, "orderNumber"> & { customer?: Pick<Customer, "companyName"> };
  })[];
};

function localDateStr(d: Date): string {
  return formatInTimeZone(d, ZONE, "yyyy-MM-dd");
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Liefert die Σ Arbeitsstunden-Minuten der Maschine zwischen `from` und `to`.
 * Berücksichtigt Working-Hours, Holidays, Wartung.
 */
export function calcAvailableMinutes(
  machine: { workingHours: unknown; maintenanceWindows: { startsAt: Date; endsAt: Date }[] },
  holidays: Set<string>,
  from: Date,
  to: Date,
): number {
  const wh = parseWorkingHours(machine.workingHours);
  const blackouts = machine.maintenanceWindows.map((m) => ({
    start: m.startsAt,
    end: m.endsAt,
  }));
  let totalMs = 0;
  let cursor = new Date(`${localDateStr(from)}T12:00:00.000Z`);
  const end = new Date(`${localDateStr(to)}T12:00:00.000Z`);
  while (cursor <= end) {
    const dateStr = localDateStr(cursor);
    const windows = workWindowsForDay(wh, holidays, blackouts, dateStr);
    for (const w of windows) {
      // Clamp auf Periode
      const start = w.start < from ? from : w.start;
      const stop = w.end > to ? to : w.end;
      if (stop > start) totalMs += stop.getTime() - start.getTime();
    }
    cursor = addDays(cursor, 1);
  }
  return Math.round(totalMs / 60_000);
}

/**
 * Σ gebuchte Minuten — clamped auf die Periode (falls ein Booking vor/nach
 * dem Range startet/endet).
 */
export function calcBookedMinutes(
  bookings: { plannedStart: Date; plannedEnd: Date }[],
  from: Date,
  to: Date,
): number {
  let totalMs = 0;
  for (const b of bookings) {
    if (b.plannedEnd <= from || b.plannedStart >= to) continue;
    const start = b.plannedStart < from ? from : b.plannedStart;
    const stop = b.plannedEnd > to ? to : b.plannedEnd;
    totalMs += stop.getTime() - start.getTime();
  }
  return Math.round(totalMs / 60_000);
}

export function buildMachineUtilization(args: {
  company: { name: string };
  period: { from: Date; to: Date };
  machines: MachineWithBookings[];
  holidays: Set<string>;
}): MachineUtilizationReport {
  const rows: MachineUtilizationRow[] = args.machines.map((m) => {
    const available = calcAvailableMinutes(
      m,
      args.holidays,
      args.period.from,
      args.period.to,
    );
    const inRange = m.scheduleEntries.filter(
      (e) => e.plannedEnd > args.period.from && e.plannedStart < args.period.to,
    );
    const booked = calcBookedMinutes(inRange, args.period.from, args.period.to);
    const utilization = available === 0 ? 0 : (booked / available) * 100;
    return {
      machineId: m.id,
      machineName: m.name,
      machineType: m.type,
      availableMinutes: available,
      bookedMinutes: booked,
      utilizationPct: round2(utilization),
      bookingCount: inRange.length,
    };
  });

  const sumAvail = rows.reduce((s, r) => s + r.availableMinutes, 0);
  const sumBooked = rows.reduce((s, r) => s + r.bookedMinutes, 0);
  const totalUtil = sumAvail === 0 ? 0 : (sumBooked / sumAvail) * 100;

  return {
    company: args.company,
    period: args.period,
    rows,
    totals: {
      availableMinutes: sumAvail,
      bookedMinutes: sumBooked,
      utilizationPct: round2(totalUtil),
    },
  };
}

export async function loadMachineUtilization(args: {
  prisma: import("@prisma/client").PrismaClient;
  companyId: string;
  from: Date;
  to: Date;
}): Promise<MachineUtilizationReport> {
  const { prisma, companyId, from, to } = args;
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { name: true },
  });
  const machines = await prisma.machine.findMany({
    where: {
      companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    include: {
      maintenanceWindows: true,
      scheduleEntries: {
        where: {
          plannedEnd: { gt: from },
          plannedStart: { lt: to },
        },
        include: {
          order: { include: { customer: { select: { companyName: true } } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const holidayRows = await prisma.holiday.findMany({
    where: { companyId },
    select: { date: true },
  });
  const holidays = new Set(holidayRows.map((h) => h.date.toISOString().slice(0, 10)));

  return buildMachineUtilization({
    company,
    period: { from, to },
    machines,
    holidays,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
