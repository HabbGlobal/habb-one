// Quotes list with status tabs.

import Link from "next/link";
import { Prisma, type QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hasPermission } from "@/lib/permissions";
import { toQuoteListItemDTO } from "@/lib/dto/quote";
import { QuoteList } from "./QuoteList";

export const dynamic = "force-dynamic";

const TABS: ReadonlyArray<{
  key: "open" | "accepted" | "closed" | "all";
  label: string;
  filter: Prisma.QuoteWhereInput;
}> = [
  { key: "open", label: "Open", filter: { status: { in: ["DRAFT", "SENT"] as QuoteStatus[] } } },
  { key: "accepted", label: "Accepted", filter: { status: "ACCEPTED" } },
  { key: "closed", label: "Closed", filter: { status: { in: ["REJECTED", "EXPIRED"] as QuoteStatus[] } } },
  { key: "all", label: "All", filter: {} },
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "quotes.read")) redirect("/admin");

  const sp = await searchParams;
  const tabKey = TABS.find((t) => t.key === sp.tab)?.key ?? "open";
  const tab = TABS.find((t) => t.key === tabKey)!;

  const baseWhere: Prisma.QuoteWhereInput = { companyId: session.user.companyId };
  const filterWhere: Prisma.QuoteWhereInput = { ...baseWhere, ...tab.filter };

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    filterWhere.OR = [
      { quoteNumber: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }

  // Counts pro Tab
  const counts: Record<string, number> = {};
  for (const t of TABS) {
    counts[t.key] = await prisma.quote.count({
      where: { ...baseWhere, ...t.filter },
    });
  }

  const quotes = await prisma.quote.findMany({
    where: filterWhere,
    include: {
      customer: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
      items: { select: { id: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });

  const rows = quotes.map(toQuoteListItemDTO);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quotes</h1>
          <p className="text-sm text-muted-foreground">Create, send and convert quotes into orders.</p>
        </div>
        {hasPermission(session.user.role, "quotes.write") && (
          <Button asChild>
            <Link href="/admin/quotes/new">New Quote</Link>
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
              href={t.key === "open" ? "/admin/quotes" : `/admin/quotes?tab=${t.key}`}
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
          <QuoteList rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
