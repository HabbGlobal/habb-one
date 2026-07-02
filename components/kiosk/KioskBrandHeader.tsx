// Brand header for all kiosk screens: landing, PIN, and actions.
// Displays the logo and company name on the left, an optional slot for
// controls, and the Habb wordmark on the right.
//
// The logo is loaded from the public kiosk logo endpoint. If the tenant has no
// logo, the default Habb logo is used so the header never appears empty.

import { HabbWordmark } from "./HabbWordmark";

interface Props {
  companyName: string;
  companyId: string;
  hasLogo: boolean;
  /** Optional subtitle below the company name, such as "Workshop kiosk". */
  subtitle?: string;
  /** Logo cache buster so changes become visible immediately. */
  logoVersion?: string;
  /** Right-side slot for logout, language, and admin controls. */
  rightSlot?: React.ReactNode;
  /** Show the wordmark in the header. Disable it on narrow screens such as
   *  the PIN page, where the footer already provides branding. */
  showWordmark?: boolean;
  className?: string;
}

export function KioskBrandHeader({
  companyName,
  companyId,
  hasLogo,
  subtitle,
  logoVersion,
  rightSlot,
  showWordmark = true,
  className = "",
}: Props) {
  // Use the public kiosk-specific logo endpoint. `/api/company/logo` requires
  // a session and only returns the authenticated user's company logo, which
  // does not work for an anonymous kiosk assigned to a company.
  const logoSrc = hasLogo
    ? `/api/kiosk/company/${encodeURIComponent(companyId)}/logo?v=${encodeURIComponent(logoVersion ?? companyId)}`
    : "/brand/habb-logo.png";

  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-4 border-b border-habb-line pb-5 ${className}`}
    >
      <div className="flex items-center gap-4 min-w-0">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt={`${companyName} Logo`}
            className="h-12 w-auto max-w-[200px] object-contain"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-habb-line bg-habb-paper text-xl font-semibold text-habb-ink"
          >
            {(companyName.trim().charAt(0) || "?").toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl md:text-2xl font-semibold tracking-tight text-habb-ink">
            {companyName}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-habb-muted">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {rightSlot}
        {/* Show the wordmark only on desktop. Tablets and mobile screens use
            the footer branding to keep the header from becoming crowded.
            `showWordmark=false` hides it completely on narrow layouts. */}
        {showWordmark && (
          <div className="hidden lg:block">
            <HabbWordmark size="md" />
          </div>
        )}
      </div>
    </header>
  );
}
