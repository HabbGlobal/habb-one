// Shared currency formatting utilities. All UI components and PDF generators
// should use these instead of creating ad-hoc `Intl.NumberFormat` instances
// with a hardcoded currency.

/**
 * Format a number as currency with fraction digits (e.g. "CHF 1'234.56"
 * or "LKR 1,234.56" depending on locale/currency).
 */
export function formatCurrency(
  n: number | null | undefined,
  currency: string,
  locale?: string,
): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale ?? localeForCurrency(currency), {
    style: "currency",
    currency,
  }).format(n);
}

/**
 * Format a number as currency WITHOUT fraction digits — useful for large
 * KPI numbers (e.g. "CHF 45'000" or "LKR 45,000").
 */
export function formatCurrencyLarge(
  n: number | null | undefined,
  currency: string,
  locale?: string,
): string {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale ?? localeForCurrency(currency), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Best-effort locale for a given currency code. */
function localeForCurrency(currency: string): string {
  switch (currency) {
    case "CHF":
      return "de-CH";
    case "EUR":
      return "de-DE";
    case "LKR":
      return "en-LK";
    default:
      return "en-US";
  }
}
