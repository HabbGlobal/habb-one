// Tab navigation between the planning sub-views.
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "plan" | "areas";

const tabs: { key: Tab; label: string; href: string }[] = [
  { key: "plan", label: "Monatsplan", href: "/admin/schedule" },
  { key: "areas", label: "Bereich-Übersicht", href: "/admin/schedule/areas" },
];

export function ScheduleSubNav({ active }: { active: Tab }) {
  return (
    <div className="flex items-center gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            active === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
