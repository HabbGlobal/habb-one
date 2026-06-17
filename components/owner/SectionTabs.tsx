"use client";

/**
 * Narrow tab switcher for owner list views ("Active" vs "Archive").
 * Intentionally small: no external tabs library, only links with active
 * highlighting based on the current path.
 *
 * Counts are precomputed by the server-component parent and passed through.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface TabItem {
  href: string;
  label: string;
  count?: number;
}

export function SectionTabs({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      role="tablist"
      className="inline-flex items-center gap-1 rounded-lg border border-habb-line bg-white p-1"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-habb-black text-white"
                : "text-habb-muted hover:bg-habb-paper hover:text-habb-ink",
            )}
          >
            <span>{tab.label}</span>
            {typeof tab.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                  active
                    ? "bg-white/15 text-white"
                    : "bg-habb-paper text-habb-muted",
                )}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
