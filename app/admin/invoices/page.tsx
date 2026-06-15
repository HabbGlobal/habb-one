// Invoice list with status tabs.

import Link from "next/link";
import { Prisma, type InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hasPermission } from "@/lib/permissions";
import { toInvoiceListItemDTO } from "@/lib/dto/invoice";
import { refreshOverdueInvoices } from "./actions";
import { InvoiceList } from "./InvoiceList";

export const dynamic = "force-dynamic";

const TABS: ReadonlyArray<{
  key: "open" | "paid" | "cancelled" | "all";
  label: string;
  filter: Prisma.InvoiceWhereInput;
}> = [
  {
    key: "open",
    label: "Open",
    filter: { status: { in: ["DRAFT", "SENT", "OVERDUE"] as InvoiceStatus[] } },
  },
  { key: "paid", label: "Paid", filter: { status: "PAID" } },
  { key: "cancelled", label: "Cancelled", filter: { status: "CANCELLED" } },
  { key: "all", label: "All", filter: {} },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "invoices.read")) redirect("/admin");

  // Auto-Overdue beim Laden — idempotent
  await refreshOverdueInvoices();

  const sp = await searchParams;
  const tabKey = TABS.find((t) => t.key === sp.tab)?.key ?? "open";
  const tab = TABS.find((t) => t.key === tabKey)!;

  const baseWhere: Prisma.InvoiceWhereInput = {
    companyId: session.user.companyId,
    archivedAt: null,
    deletedAt: null,
  };
  const filterWhere: Prisma.InvoiceWhereInput = { ...baseWhere, ...tab.filter };

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    filterWhere.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const counts: Record<string, number> = {};
  for (const t of TABS) {
    counts[t.key] = await prisma.invoice.count({
      where: { ...baseWhere, ...t.filter },
    });
  }

  const invoices = await prisma.invoice.findMany({
    where: filterWhere,
    include: {
      customer: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
    },
    orderBy: [{ issuedAt: "desc" }, { invoiceNumber: "desc" }],
    take: 200,
  });

  const rows = invoices.map(toInvoiceListItemDTO);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-sm text-muted-foreground">Create and send Swiss QR invoices, and record payments.</p>
        </div>
        {hasPermission(session.user.role, "invoices.write") && (
          <Button asChild>
            <Link href="/admin/invoices/new">New Invoice</Link>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {TABS.map((t) => {
          const active = t.key === tabKey;
          return (
            <Link
              key={t.key}
              href={t.key === "open" ? "/admin/invoices" : `/admin/invoices?tab=${t.key}`}
              className={
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
                (active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50")
              }
            >
              {t.label}{" "}
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                ({counts[t.key]})
              </span>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-3">
          <InvoiceList rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
