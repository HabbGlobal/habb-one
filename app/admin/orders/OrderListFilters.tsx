"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * URL-driven filters for the order list. Mirrors the customers pattern.
 */
export function OrderListFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`/admin/orders?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nach Auftragsnummer, Kunde, Notizen …"
          defaultValue={sp.get("q") ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => update("q", v), 300);
            return () => clearTimeout(t);
          }}
          className="pl-8"
        />
      </div>
      <Select
        value={sp.get("status") ?? "all"}
        onChange={(e) => update("status", e.target.value)}
        className="w-44"
        aria-label="Status filtern"
      >
        <option value="all">All Status</option>
        <option value="DRAFT">Entwurf</option>
        <option value="CONFIRMED">Bestätigt</option>
        <option value="IN_PROGRESS">In Arbeit</option>
        <option value="ON_HOLD">Pausiert</option>
        <option value="COMPLETED">Closed</option>
        <option value="DELIVERED">Geliefert</option>
        <option value="INVOICED">Verrechnet</option>
        <option value="CANCELLED">Cancelled</option>
      </Select>
      <Select
        value={sp.get("priority") ?? "all"}
        onChange={(e) => update("priority", e.target.value)}
        className="w-32"
        aria-label="Priorität filtern"
      >
        <option value="all">All Prios</option>
        <option value="LOW">Niedrig</option>
        <option value="NORMAL">Normal</option>
        <option value="HIGH">Hoch</option>
        <option value="EXPRESS">Express</option>
      </Select>
      <Select
        value={sp.get("late") ?? "all"}
        onChange={(e) => update("late", e.target.value)}
        className="w-44"
        aria-label="Verspätet filtern"
      >
        <option value="all">All Liefertermine</option>
        <option value="yes">Nur overdue</option>
      </Select>
    </div>
  );
}
