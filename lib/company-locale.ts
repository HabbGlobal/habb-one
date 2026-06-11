// Geteilte Auswahl-Optionen für Land + Zeitzone eines Mandanten.
// Client-safe (nur Konstanten) — von Owner- und Kunden-Formularen genutzt.

export interface CountryOption {
  code: string; // ISO-3166 alpha-2
  label: string;
}

/** Auswählbare Länder. Schweiz-Fokus + Sri Lanka. */
export const COUNTRY_OPTIONS: ReadonlyArray<CountryOption> = [
  { code: "CH", label: "Schweiz" },
  { code: "FL", label: "Liechtenstein" },
  { code: "DE", label: "Deutschland" },
  { code: "AT", label: "Österreich" },
  { code: "LK", label: "Sri Lanka" },
];

export interface TimezoneOption {
  zone: string; // IANA-Zeitzone
  label: string;
}

/** Auswählbare Zeitzonen — wird funktional in die Zeitberechnung verdrahtet. */
export const TIMEZONE_OPTIONS: ReadonlyArray<TimezoneOption> = [
  { zone: "Europe/Zurich", label: "Europe/Zurich (Schweiz, UTC+1/+2)" },
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
