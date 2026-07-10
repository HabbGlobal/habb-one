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
  theme?: "light" | "dark";
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
  theme = "light",
}: Props) {
  const logoSrc = hasLogo
    ? `/api/kiosk/company/${encodeURIComponent(
        companyId,
      )}/logo?v=${encodeURIComponent(logoVersion ?? companyId)}`
    : null;

  const themeClass = theme === "dark" 
    ? "border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl text-white" 
    : "border-habb-line bg-white shadow-sm text-habb-ink";

  return (
    <header
      className={`rounded-2xl border p-5 ${themeClass} ${className}`}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={`${companyName} logo`}
              className="h-12 w-auto max-w-[180px] object-contain rounded-lg"
            />
          ) : (
            <img
              src="/brand/habb-logo.png"
              alt="Habb Logo"
              className="h-12 w-auto object-contain rounded-lg"
            />
          )}

          <div className="min-w-0">
            <h1 className={`truncate text-2xl font-black tracking-tight ${theme === "dark" ? "text-white" : "text-habb-ink"} md:text-3xl`}>
              {companyName}
            </h1>

            {subtitle && (
              <p className={`mt-1 text-sm ${theme === "dark" ? "text-neutral-400" : "text-habb-muted"}`}>{subtitle}</p>
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