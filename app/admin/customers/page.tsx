import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LifecycleTabs } from "@/components/admin/LifecycleTabs";
import {
  lifecycleFilter,
  parseView,
  type LifecycleView,
} from "@/lib/lifecycle";
import { hasPermission } from "@/lib/permissions";
import { toCustomerListItemDTO } from "@/lib/dto/customer";
import { CustomerList } from "./CustomerList";
import { CustomerListFilters } from "./CustomerListFilters";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    type?: string;
    language?: string;
    openOrders?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "customers.read")) redirect("/admin");

  const sp = await searchParams;
  const view: LifecycleView = parseView(sp.view);

  // Build the WHERE clause from URL filters.
  const baseWhere: Prisma.CustomerWhereInput = { companyId: session.user.companyId };
  const filterWhere: Prisma.CustomerWhereInput = {
    ...baseWhere,
    ...lifecycleFilter(view),
  };

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    filterWhere.OR = [
      { customerNumber: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { contacts: { some: { firstName: { contains: q, mode: "insensitive" } } } },
      { contacts: { some: { lastName: { contains: q, mode: "insensitive" } } } },
      { contacts: { some: { email: { contains: q, mode: "insensitive" } } } },
      { addresses: { some: { city: { contains: q, mode: "insensitive" } } } },
    ];
  }
  if (sp.type === "PRIVATE" || sp.type === "BUSINESS") {
    filterWhere.type = sp.type;
  }
  if (sp.language && ["DE", "FR", "IT", "EN"].includes(sp.language)) {
    filterWhere.language = sp.language as "DE" | "FR" | "IT" | "EN";
  }
  if (sp.openOrders === "yes") {
    filterWhere.orders = {
      some: {
        status: { in: ["DRAFT", "CONFIRMED", "IN_PROGRESS", "ON_HOLD"] },
      },
    };
  }

  const [customers, active, archived, deleted] = await Promise.all([
    prisma.customer.findMany({
      where: filterWhere,
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
        addresses: { orderBy: [{ isDefault: "desc" }] },
        orders: { select: { id: true, status: true } },
        _count: { select: { orders: true } },
      },
      orderBy: [{ companyName: "asc" }, { customerNumber: "desc" }],
      take: 200,
    }),
    prisma.customer.count({ where: { ...baseWhere, ...lifecycleFilter("active") } }),
    prisma.customer.count({ where: { ...baseWhere, ...lifecycleFilter("archived") } }),
    prisma.customer.count({ where: { ...baseWhere, ...lifecycleFilter("deleted") } }),
  ]);
  const counts = { active, archived, deleted };

  const rows = customers.map(toCustomerListItemDTO);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Kunden</h1>
          <p className="text-sm text-muted-foreground">
            CRM — Stammdaten, Adressen, Kontakte
          </p>
        </div>
        {hasPermission(session.user.role, "customers.write") && (
          <Button asChild>
            <Link href="/admin/customers/new">Neuer Kunde</Link>
          </Button>
        )}
      </div>

      <LifecycleTabs baseHref="/admin/customers" current={view} counts={counts} />

      <Card>
        <CardContent className="p-3 space-y-3">
          <CustomerListFilters />
          <CustomerList view={view} rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
