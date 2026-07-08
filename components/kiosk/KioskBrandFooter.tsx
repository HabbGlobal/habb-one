import { HabbWordmark } from "./HabbWordmark";

interface Props {
  className?: string;
}

export function KioskBrandFooter({ className = "" }: Props) {
  return (
    <footer
      className={`mt-8 border-t border-habb-line pt-5 text-center ${className}`}
    >
      <p className="inline-flex flex-wrap items-center justify-center gap-1.5 text-xs text-habb-muted">
        <span>Powered by</span>

        <a
          href="https://habb.one"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-habb-red"
        >
          <HabbWordmark size="sm" />
        </a>

        <span>· HABB Global (PVT) LTD</span>
      </p>
    </footer>
  );
}