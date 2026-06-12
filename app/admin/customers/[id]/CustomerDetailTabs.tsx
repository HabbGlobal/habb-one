"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "master", label: "Master data" },
  { key: "addresses", label: "Adressen" },
  { key: "contacts", label: "Kontakte" },
  { key: "orders", label: "Orders" },
  { key: "quotes", label: "Quotes" },
  { key: "invoices", label: "Invoices" },
  { key: "stats", label: "Statistik" },
  { key: "activity", label: "Aktivität" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Props {
  master: React.ReactNode;
  addresses: React.ReactNode;
  contacts: React.ReactNode;
  orders: React.ReactNode;
  quotes: React.ReactNode;
  invoices: React.ReactNode;
  stats: React.ReactNode;
  activity: React.ReactNode;
}

/**
 * Client wrapper that toggles tab content. All tab panels are rendered on
 * the server and passed in as ReactNodes — no client-side data fetching.
 */
export function CustomerDetailTabs(props: Props) {
  const [active, setActive] = useState<TabKey>("master");

  const panel: Record<TabKey, React.ReactNode> = {
    master: props.master,
    addresses: props.addresses,
    contacts: props.contacts,
    orders: props.orders,
    quotes: props.quotes,
    invoices: props.invoices,
    stats: props.stats,
    activity: props.activity,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition",
              active === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{panel[active]}</div>
    </div>
  );
}
