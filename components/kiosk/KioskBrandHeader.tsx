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
      className={`rounded-xl border border-habb-line bg-white p-5 shadow-sm ${className}`}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${companyName} logo`}
              className="h-12 w-auto max-w-[180px] object-contain"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-habb-red text-base font-bold text-white">
              H
            </div>
          )}

          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-habb-ink md:text-2xl">
              {companyName}
            </h1>

            {subtitle && (
              <p className="mt-1 text-sm text-habb-muted">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {rightSlot}

          {showWordmark && (
            <div className="hidden border-l border-habb-line pl-4 lg:block">
              <HabbWordmark size="md" />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}