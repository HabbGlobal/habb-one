// Shared selection options for a tenant's country and timezone.
// Client-safe (constants only) — used by owner and customer forms.

export interface CountryOption {
  code: string; // ISO-3166 alpha-2
  label: string;
}

/** Selectable countries. Switzerland-focused + Sri Lanka. */
export const COUNTRY_OPTIONS: ReadonlyArray<CountryOption> = [
  { code: "CH", label: "Switzerland" },
  { code: "FL", label: "Liechtenstein" },
  { code: "DE", label: "Germany" },
  { code: "AT", label: "Austria" },
  { code: "LK", label: "Sri Lanka" },
];

export interface TimezoneOption {
  zone: string; // IANA timezone
  label: string;
}

/** Selectable timezones — wired into time calculations. */
export const TIMEZONE_OPTIONS: ReadonlyArray<TimezoneOption> = [
  { zone: "Europe/Zurich", label: "Europe/Zurich (Switzerland, UTC+1/+2)" },
  { zone: "Asia/Colombo", label: "Asia/Colombo (Sri Lanka, UTC+5:30)" },
];

const COUNTRY_CODES = new Set(COUNTRY_OPTIONS.map((c) => c.code));
const TIMEZONE_ZONES = new Set(TIMEZONE_OPTIONS.map((t) => t.zone));

export function isKnownCountry(code: string): boolean {
  return COUNTRY_CODES.has(code);
}
export function isKnownTimezone(zone: string): boolean {
  return TIMEZONE_ZONES.has(zone);
}

export function countryLabel(code: string): string {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.label ?? code;
}
