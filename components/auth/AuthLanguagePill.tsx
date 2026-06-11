"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/locales";

export function AuthLanguagePill() {
  const current = useLocale() as Locale;
  const [, start] = useTransition();
  const router = useRouter();

  const change = (next: Locale) => {
    if (next === current) return;
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    start(() => router.refresh());
  };

  return (
    <div
      role="group"
      aria-label="Sprache / Language"
      className="inline-flex items-center gap-0 rounded-full border border-habb-line bg-white p-0.5 text-xs"
    >
      {locales.map((l) => {
        const active = l === current;
        return (
          <button
            key={l}
            type="button"
            onClick={() => change(l)}
            aria-pressed={active}
            className={
              active
                ? "rounded-full bg-habb-black px-2.5 py-1 text-[11px] font-medium tracking-wide text-white"
                : "rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide text-habb-muted transition-colors duration-150 ease-out hover:text-habb-ink focus-visible:text-habb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red focus-visible:ring-offset-2 focus-visible:ring-offset-white motion-reduce:transition-none"
            }
          >
            {l.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
