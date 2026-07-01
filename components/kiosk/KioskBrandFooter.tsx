// Subtle, centered "Powered by Habb One" footer used on every kiosk screen.
// Links to HABB Global (PVT) LTD.

import { HabbWordmark } from "./HabbWordmark";

interface Props {
  className?: string;
}

export function KioskBrandFooter({ className = "" }: Props) {
  return (
    <footer
      className={`mt-8 pt-5 border-t border-habb-line text-center ${className}`}
    >
      <p className="inline-flex items-center justify-center gap-1.5 text-xs text-habb-muted">
        Powered by{" "}
        <a
          href="https://HABB Global (PVT) LTD"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-habb-ink transition-colors hover:text-habb-red"
        >
          <HabbWordmark size="sm" />
        </a>
        <span>· HABB Global (PVT) LTD</span>
      </p>
    </footer>
  );
}
