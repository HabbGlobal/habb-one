// Compact "habb. one" wordmark used consistently throughout the kiosk.
//
// "habb." uses habb-ink with a subtle habb-red dot, while "one" uses
// habb-muted so the product sub-wordmark remains understated.

interface Props {
  /** Size variant: "lg" for prominent headers and "sm" for the footer. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function HabbWordmark({ size = "md", className = "" }: Props) {
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-lg";

  return (
    <span
      className={`inline-flex items-baseline select-none ${text} ${className}`}
      aria-label="habb. one"
    >
      <span className="font-semibold tracking-tight text-habb-ink">habb</span>
      <span className="font-semibold text-habb-red">.</span>
      <span className="ml-1 font-light tracking-tight text-habb-muted">
        one
      </span>
    </span>
  );
}
