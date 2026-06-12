// Brand-Header für alle Kiosk-Bildschirme (Landing, PIN, Actions).
// Logo + Firmen-Name links, optional Right-Slot für Buttons,
// Habb-Wordmark am rechten Rand — konsistent über alle Screens.
//
// Logo wird vom bestehenden `/api/company/logo`-Endpoint geladen.
// Wenn der Mandant kein Logo hat, zeigen wir einen großen Initial-Avatar
// als Fallback, damit der Header nie "leer" wirkt.

import { HabbWordmark } from "./HabbWordmark";

interface Props {
  companyName: string;
  companyId: string;
  hasLogo: boolean;
  /** Optional kleiner Untertitel unter dem Firmen-Namen (z. B. "Werkstatt-Kiosk"). */
  subtitle?: string;
  /** Cache-Buster für das Logo, damit Änderungen sofort sichtbar sind. */
  logoVersion?: string;
  /** Rechte Slot-Position für Logout-Button, Sprache, Admin-Link. */
  rightSlot?: React.ReactNode;
  /** Wordmark im Header anzeigen. Default true; auf engen Seiten (PIN)
   *  abschalten — der Footer macht das Branding eh. */
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
  // Kiosk-spezifischer, public-Logo-Endpoint — der `/api/company/logo`
  // verlangt eine Session und liefert nur das Logo des Auth-Users,
  // was hier nicht funktioniert (Kiosk = anonym, fest auf eine Firma).
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
        {/* Wordmark nur auf Desktop sichtbar — auf Tablets/Mobile kommt
            das Branding via Footer rüber, sonst wird der Header zu eng.
            `showWordmark=false` (z. B. PIN-Seite mit schmalem Container)
            unterdrückt es ganz. */}
        {showWordmark && (
          <div className="hidden lg:block">
            <HabbWordmark size="md" />
          </div>
        )}
      </div>
    </header>
  );
}
