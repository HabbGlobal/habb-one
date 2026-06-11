// Time-zone helpers. The application stores all timestamps as UTC and
// interprets them in a tenant timezone for display and aggregation.
//
// Default-Zeitzone ist Europe/Zurich (Schweiz). Mandanten in anderen
// Zeitzonen (z. B. Sri Lanka / Asia/Colombo) geben ihre Zeitzone als
// optionalen `zone`-Parameter mit — die Zeiterfassungs-Kernpfade
// (punch.ts, service.ts, Sheet-Actions) lösen die Mandanten-Zeitzone auf
// und reichen sie hier durch. Ohne Parameter gilt Europe/Zurich, sodass
// die bestehende CH-Logik bitgenau unverändert bleibt.
//
// WICHTIG: Diese Datei wird auch von Client-Komponenten importiert
// (Anzeige-Formatierung). Sie darf deshalb KEINE Server-only-Abhängigkeit
// (prisma, node:async_hooks) enthalten — die Zeitzone wird explizit
// übergeben.
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

/** Standard-Zeitzone, wenn keine Mandanten-Zeitzone übergeben wird. */
export const DEFAULT_ZONE = "Europe/Zurich";

/**
 * @deprecated Direkt-Konstante — weiterhin genutzt vom Scheduler
 * (Werkstatt-Plan) und reiner Anzeige. Für mandantenabhängige
 * Zeiterfassung den `zone`-Parameter der Funktionen verwenden.
 */
export const ZONE = DEFAULT_ZONE;

/** Returns the local Y-M-D for an instant in `zone`. */
export function localDateString(d: Date, zone: string = DEFAULT_ZONE): string {
  return formatInTimeZone(d, zone, "yyyy-MM-dd");
}

/**
 * Returns a Date suitable for the `workDate` column (Prisma `@db.Date`).
 *
 * Zeitzonen-UNABHÄNGIG: wir senden UTC-Mitternacht des gewünschten
 * Kalendertags. Postgres trunkiert das exakt auf diesen Tag — egal in
 * welcher Session-Zeitzone. Welcher Kalendertag das ist, bestimmt der
 * Aufrufer via `localDateString(instant, zone)`.
 */
export function localMidnightUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Returns the local Date object for `zone` (display/aggregation). */
export function asZoned(d: Date, zone: string = DEFAULT_ZONE): Date {
  return toZonedTime(d, zone);
}

/** Combine an ISO date string and "HH:mm" into a UTC instant in `zone`. */
export function combineDateAndTime(
  dateStr: string,
  hhmm: string,
  zone: string = DEFAULT_ZONE,
): Date {
  return fromZonedTime(`${dateStr}T${hhmm}:00`, zone);
}

/** Day-of-week from local-date string (Mon=0 ... Sun=6) in `zone`. */
export function localWeekdayIndex(dateStr: string, zone: string = DEFAULT_ZONE): number {
  const d = localMidnightUtc(dateStr);
  // getDay() in UTC returns 0..6 Sun..Sat; we want Mon=0..Sun=6.
  const tz = toZonedTime(d, zone);
  return (tz.getDay() + 6) % 7;
}

export function formatTimeLocal(d: Date, zone: string = DEFAULT_ZONE): string {
  return formatInTimeZone(d, zone, "HH:mm");
}

export function formatDateTimeLocal(d: Date, zone: string = DEFAULT_ZONE): string {
  return formatInTimeZone(d, zone, "dd.MM.yyyy HH:mm");
}

export { format };
