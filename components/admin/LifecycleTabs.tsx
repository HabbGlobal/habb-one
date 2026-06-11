// Folder tabs (Aktiv / Archiv / Papierkorb) for any list view. Counts are
// passed in by the page so we don't hit the DB twice.
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LIFECYCLE_VIEWS, type LifecycleView, lifecycleLabel } from "@/lib/lifecycle";

export function LifecycleTabs({
  baseHref,
  current,
  counts,
}: {
  baseHref: string;
  current: LifecycleView;
  counts: Record<LifecycleView, number>;
}) {
  return (
    <div className="flex items-center gap-1 border-b">
      {LIFECYCLE_VIEWS.map((v) => {
        const href = v === "active" ? baseHref : `${baseHref}?view=${v}`;
        const active = v === current;
        return (
          <Link
            key={v}
            href={href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
            )}
          >
            {lifecycleLabel(v)}{" "}
            <span className="ml-1 text-xs text-muted-foreground tabular-nums">
              ({counts[v]})
            </span>
          </Link>
        );
      })}
    </div>
  );
}
