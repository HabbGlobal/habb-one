"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/select";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/locales";

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const [, start] = useTransition();
  const router = useRouter();

  const change = (next: Locale) => {
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    start(() => router.refresh());
  };

  return (
    <Select
      value={locale}
      onChange={(e) => change(e.target.value as Locale)}
      className="w-28"
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {l.toUpperCase()}
        </option>
      ))}
    </Select>
  );
}
