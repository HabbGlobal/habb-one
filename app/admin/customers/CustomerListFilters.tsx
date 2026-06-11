"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Filters for the customer list. Pushes state into the URL search params
 * so the server component re-renders with the right query.
 */
export function CustomerListFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`/admin/customers?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nach Name, Nr., Ort, E-Mail …"
          defaultValue={sp.get("q") ?? ""}
          onChange={(e) => {
            // Lightweight debounce — server-side query is cheap enough.
            const v = e.target.value;
            const t = setTimeout(() => update("q", v), 300);
            return () => clearTimeout(t);
          }}
          className="pl-8"
        />
      </div>
      <Select
        value={sp.get("type") ?? "all"}
        onChange={(e) => update("type", e.target.value)}
        className="w-36"
        aria-label="Typ filtern"
      >
        <option value="all">Alle Typen</option>
        <option value="PRIVATE">Privat</option>
        <option value="BUSINESS">Geschäft</option>
      </Select>
      <Select
        value={sp.get("language") ?? "all"}
        onChange={(e) => update("language", e.target.value)}
        className="w-28"
        aria-label="Sprache filtern"
      >
        <option value="all">Alle Sprachen</option>
        <option value="DE">DE</option>
        <option value="FR">FR</option>
        <option value="IT">IT</option>
        <option value="EN">EN</option>
      </Select>
      <Select
        value={sp.get("openOrders") ?? "all"}
        onChange={(e) => update("openOrders", e.target.value)}
        className="w-44"
        aria-label="Offene Aufträge filtern"
      >
        <option value="all">Alle Kunden</option>
        <option value="yes">Mit offenen Aufträgen</option>
      </Select>
    </div>
  );
}
