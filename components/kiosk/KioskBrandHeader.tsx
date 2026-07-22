import type { ReactNode } from "react";
import { HabbWordmark } from "./HabbWordmark";

interface Props {
  companyName: string;
  companyId: string;
  hasLogo: boolean;
  subtitle?: string;
  logoVersion?: string;
  rightSlot?: ReactNode;
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
  const logoSrc = hasLogo
    ? `/api/kiosk/company/${encodeURIComponent(
        companyId,
      )}/logo?v=${encodeURIComponent(logoVersion ?? companyId)}`
    : null;

  return (
    <header
      className={`rounded-xl border border-habb-line bg-white text-habb-ink shadow-sm p-3 dark:border-white/10 dark:bg-white/5 dark:text-white dark:backdrop-blur-xl dark:shadow-2xl ${className}`}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${companyName} logo`}
              className="h-8 w-auto max-w-[150px] object-contain rounded-lg"
            />
          ) : (
            <img
              src="/brand/habb-logo.png"
              alt="Habb Logo"
              className="h-8 w-auto object-contain rounded-lg"
            />
          )}

          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-tight text-habb-ink dark:text-white md:text-2xl">
              {companyName}
            </h1>

            {subtitle && (
              <p className="mt-1 text-sm text-habb-muted dark:text-neutral-400">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {rightSlot}

          {showWordmark && (
            <div className="hidden border-l border-habb-line pl-4 dark:border-white/10 lg:block">
              <HabbWordmark size="md" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}