interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
  theme?: "light" | "dark";
}

export function HabbWordmark({ size = "md", className = "", theme = "light" }: Props) {
  const sizeClass =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-lg";

  const isDark = theme === "dark";

  return (
    <span
      className={`inline-flex select-none items-baseline ${sizeClass} ${className}`}
      aria-label="habb.one"
    >
      <span className={`font-semibold tracking-tight ${isDark ? "text-white" : "text-habb-ink"}`}>habb</span>
      <span className="font-semibold text-habb-red">.</span>
      <span className={`ml-1 font-light tracking-tight ${isDark ? "text-neutral-400" : "text-habb-muted"}`}>
        one
      </span>
    </span>
  );
}