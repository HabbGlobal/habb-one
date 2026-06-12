// Kleines "habb. one"-Wordmark — überall im Kiosk konsistent.
//
// "habb." in habb-ink, der Punkt in habb-red als subtiler Akzent
// (gleicher Visual-Trick wie auf HABB Global (PVT) LTD). "one" daneben in habb-muted
// damit das Produkt-Sub-Wordmark dezent bleibt.

interface Props {
  /** Größen-Variante. "lg" auf hellen Landing-Headern, "sm" im Footer. */
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
