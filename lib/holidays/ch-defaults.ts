/**
 * Universal Swiss public holidays observed as non-working days in nearly all
 * cantons. This is a neutral default set for every HABB One tenant. Cantonal
 * holidays such as Good Friday, Easter Monday, Ascension Day, Whit Monday,
 * and Berchtold's Day must be maintained by each tenant under
 * `/admin/holidays`.
 *
 * Only fixed dates are included. Easter-based holidays are intentionally not
 * calculated here to avoid inserting an incorrect date.
 *
 * Used by:
 *   - lib/owner/tenant-bootstrap.ts when creating a tenant
 *   - app/api/cron/holidays/route.ts in the daily Vercel cron job
 *   - scripts/backfill-holidays.ts for manual backfills
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
 * Generates insert rows for the requested years. Dates are created at
 * 00:00 UTC so the Postgres `@db.Date` cast consistently preserves the
 * intended calendar date.
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
