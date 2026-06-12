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
import { toOrderListItemDTO } from "@/lib/dto/order";
import { OrderList } from "./OrderList";
import { OrderListFilters } from "./OrderListFilters";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    status?: string;
    priority?: string;
    late?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "orders.read")) redirect("/admin");

  const sp = await searchParams;
  const view: LifecycleView = parseView(sp.view);

  const baseWhere: Prisma.OrderWhereInput = { companyId: session.user.companyId };
  const filterWhere: Prisma.OrderWhereInput = {
    ...baseWhere,
    ...lifecycleFilter(view),
  };

  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    filterWhere.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
      { customer: { contacts: { some: { lastName: { contains: q, mode: "insensitive" } } } } },
    ];
  }
  if (
    sp.status &&
    [
      "DRAFT", "CONFIRMED", "IN_PROGRESS", "ON_HOLD",
      "COMPLETED", "DELIVERED", "CANCELLED", "INVOICED",
    ].includes(sp.status)
  ) {
    filterWhere.status = sp.status as Prisma.OrderWhereInput["status"];
  }
  if (sp.priority && ["LOW", "NORMAL", "HIGH", "EXPRESS"].includes(sp.priority)) {
    filterWhere.priority = sp.priority as Prisma.OrderWhereInput["priority"];
  }
  if (sp.late === "yes") {
    filterWhere.promisedAt = { lt: new Date() };
    filterWhere.status = {
      notIn: ["COMPLETED", "DELIVERED", "INVOICED", "CANCELLED"],
    };
  }

  const [orders, active, archived, deleted] = await Promise.all([
    prisma.order.findMany({
      where: filterWhere,
      include: {
        customer: { include: { contacts: { where: { isPrimary: true }, take: 1 } } },
        items: {
          include: {
            processSteps: {
              select: {
                estimatedMinutes: true,
                actualMinutes: true,
                billedMinutes: true,
                billingTimeSource: true,
              },
            },
          },
        },
      },
      orderBy: [{ promisedAt: "asc" }, { orderNumber: "desc" }],
      take: 200,
    }),
    prisma.order.count({ where: { ...baseWhere, ...lifecycleFilter("active") } }),
    prisma.order.count({ where: { ...baseWhere, ...lifecycleFilter("archived") } }),
    prisma.order.count({ where: { ...baseWhere, ...lifecycleFilter("deleted") } }),
  ]);
  const counts = { active, archived, deleted };

  const rows = orders.map(toOrderListItemDTO);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            Aufträge erfassen, bestätigen, planen und ausliefern.
          </p>
        </div>
        {hasPermission(session.user.role, "orders.write") && (
          <Button asChild>
            <Link href="/admin/orders/new">Neuer Auftrag</Link>
          </Button>
        )}
      </div>

      <LifecycleTabs baseHref="/admin/orders" current={view} counts={counts} />

      <Card>
        <CardContent className="p-3 space-y-3">
          <OrderListFilters />
          <OrderList view={view} rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
