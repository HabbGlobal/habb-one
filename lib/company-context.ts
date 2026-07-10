// Server-side helper to load a company's locale settings (timezone, country,
// currency, Intl locale) in a single query. All server components and route
// handlers should use this instead of hardcoding "Europe/Zurich" or "CHF".
//
// NOTE: This file imports prisma — it is SERVER-ONLY. Client components
// must receive the values as props.

import { prisma } from "@/lib/prisma";
import { currencyForCountry, localeForCountry } from "@/lib/company-locale";
import { DEFAULT_ZONE } from "@/lib/time/zone";

export interface CompanyLocale {
  timezone: string;
  country: string;
  /** ISO-4217 currency code derived from the company country. */
  currency: string;
  /** Intl locale string derived from the company country (e.g. "de-CH"). */
  locale: string;
}

/**
 * Loads the company's locale context from the DB. Falls back to Swiss
 * defaults if the company cannot be found (shouldn't happen in practice,
 * but keeps callers from crashing).
 */
export async function getCompanyLocale(companyId: string): Promise<CompanyLocale> {
  try {
    const c = await prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true, country: true },
    });
    const country = c?.country ?? "CH";
    return {
      timezone: c?.timezone ?? DEFAULT_ZONE,
      country,
      currency: currencyForCountry(country),
      locale: localeForCountry(country),
    };
  } catch {
    return {
      timezone: DEFAULT_ZONE,
      country: "CH",
      currency: "CHF",
      locale: "de-CH",
    };
  }
}
