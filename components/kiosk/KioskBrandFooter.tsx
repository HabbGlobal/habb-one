import { HabbWordmark } from "./HabbWordmark";

interface Props {
  className?: string;
  theme?: "light" | "dark";
}

export function KioskBrandFooter({ className = "", theme = "light" }: Props) {
  const isDark = theme === "dark";

  return (
    <footer
      className={`mt-8 border-t ${isDark ? "border-white/10" : "border-habb-line"} pt-5 text-center ${className}`}
    >
      <p className={`inline-flex flex-wrap items-center justify-center gap-1.5 text-xs ${isDark ? "text-neutral-400" : "text-habb-muted"}`}>
        <span>Powered by</span>

        <a
          href="https://habb.one"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-habb-red"
        >
          <HabbWordmark size="sm" theme={theme} />
        </a>
      </p>
    </footer>
  );
}