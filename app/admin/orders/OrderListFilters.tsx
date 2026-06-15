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
          placeholder="Search by order number, customer, notes …"
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
        aria-label="Filter status"
      >
        <option value="all">All Status</option>
        <option value="DRAFT">Draft</option>
        <option value="CONFIRMED">Confirmed</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="ON_HOLD">On Hold</option>
        <option value="COMPLETED">Closed</option>
        <option value="DELIVERED">Delivered</option>
        <option value="INVOICED">Invoiced</option>
        <option value="CANCELLED">Cancelled</option>
      </Select>
      <Select
        value={sp.get("priority") ?? "all"}
        onChange={(e) => update("priority", e.target.value)}
        className="w-32"
        aria-label="Filter priority"
      >
        <option value="all">All Prios</option>
        <option value="LOW">Low</option>
        <option value="NORMAL">Normal</option>
        <option value="HIGH">High</option>
        <option value="EXPRESS">Express</option>
      </Select>
      <Select
        value={sp.get("late") ?? "all"}
        onChange={(e) => update("late", e.target.value)}
        className="w-44"
        aria-label="Filter late"
      >
        <option value="all">All delivery dates</option>
        <option value="yes">Nur overdue</option>
      </Select>
    </div>
  );
}
