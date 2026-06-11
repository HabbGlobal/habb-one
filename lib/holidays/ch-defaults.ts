/**
 * Universelle Schweizer Feiertage, die in praktisch allen Kantonen als
 * arbeitsfreier Tag gelten — als neutrales Default-Set für jeden HABB
 * One-Mandanten. Kantonale Spezialitäten (Karfreitag, Ostermontag,
 * Auffahrt, Pfingstmontag, Berchtoldstag …) muss der Tenant unter
 * `/admin/holidays` selbst pflegen, weil sie kantonsabhängig sind.
 *
 * Nur fixe Daten — Easter-basierte Feiertage berechnen wir bewusst nicht,
 * damit kein falsches Datum reinrutscht.
 *
 * Verwendet von:
 *   - lib/owner/tenant-bootstrap.ts  (bei Neuanlage)
 *   - app/api/cron/holidays/route.ts (Vercel-Cron, einmal täglich)
 *   - scripts/backfill-holidays.ts   (manuell für Backfill)
 */

export interface SwissBaseHoliday {
  month: number;
  day: number;
  nameDe: string;
  nameEn: string;
}

export const SWISS_BASE_HOLIDAYS: ReadonlyArray<SwissBaseHoliday> = [
  { month: 1,  day: 1,  nameDe: "Neujahr",        nameEn: "New Year's Day"     },
  { month: 5,  day: 1,  nameDe: "Tag der Arbeit", nameEn: "Labour Day"         },
  { month: 8,  day: 1,  nameDe: "Bundesfeier",    nameEn: "Swiss National Day" },
  { month: 12, day: 25, nameDe: "Weihnachten",    nameEn: "Christmas"          },
  { month: 12, day: 26, nameDe: "Stephanstag",    nameEn: "St. Stephen's Day"  },
];

export interface HolidayInsertRow {
  companyId: string;
  date: Date;
  nameDe: string;
  nameEn: string;
  fraction: number;
}

/**
 * Generiert die Insert-Rows für die angegebenen Jahre.
 * Daten werden in UTC um 00:00 angelegt, damit der `@db.Date`-Cast in
 * Postgres konsistent das richtige Kalenderdatum trifft.
 */
export function buildSwissHolidayRows(
  companyId: string,
  years: number[],
): HolidayInsertRow[] {
  const rows: HolidayInsertRow[] = [];
  for (const year of years) {
    for (const h of SWISS_BASE_HOLIDAYS) {
      const mm = String(h.month).padStart(2, "0");
      const dd = String(h.day).padStart(2, "0");
      rows.push({
        companyId,
        date: new Date(`${year}-${mm}-${dd}T00:00:00.000Z`),
        nameDe: h.nameDe,
        nameEn: h.nameEn,
        fraction: 1,
      });
    }
  }
  return rows;
}
