interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function HabbWordmark({ size = "md", className = "" }: Props) {
  const sizeClass =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-lg";

  return (
    <span
      className={`inline-flex select-none items-baseline ${sizeClass} ${className}`}
      aria-label="habb.one"
    >
      <span className="font-semibold tracking-tight text-habb-ink dark:text-white">habb</span>
      <span className="font-semibold text-habb-red">.</span>
      <span className="ml-1 font-light tracking-tight text-habb-muted dark:text-neutral-400">
        one
      </span>
    </span>
  );
}