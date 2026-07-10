import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { customerDisplayName } from "@/lib/dto/customer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderWizard } from "../OrderWizard";
import { PROCESS_RESOURCES } from "@/lib/order/process-templates";
import { loadActiveTemplates } from "@/lib/templates/load";
import { getCompanyLocale } from "@/lib/company-context";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "orders.write")) redirect("/admin/orders");

  const companyLocale = await getCompanyLocale(session.user.companyId);

  const customers = await prisma.customer.findMany({
    where: {
      companyId: session.user.companyId,
      archivedAt: null,
      deletedAt: null,
    },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] },
      addresses: { orderBy: [{ isDefault: "desc" }] },
    },
    orderBy: [{ companyName: "asc" }, { customerNumber: "desc" }],
  });

  const customerOptions = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    customerNumber: c.customerNumber,
    defaultDiscount: c.defaultDiscount ? Number(c.defaultDiscount) : 0,
    contacts: c.contacts.map((ct) => ({
      id: ct.id,
      label: `${ct.firstName} ${ct.lastName}${ct.position ? ` · ${ct.position}` : ""}`,
      isPrimary: ct.isPrimary,
    })),
    addresses: c.addresses.map((a) => ({
      id: a.id,
      label: `${a.street}, ${a.zip} ${a.city}`,
      type: a.type,
    })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Order</h1>
        <p className="text-sm text-muted-foreground">
          Enter customer, dates, items and process flow — status starts
          as <strong>Draft</strong>. Will be frozen on confirmation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Details</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderWizard
            mode="create"
            customers={customerOptions}
            templates={(await loadActiveTemplates(prisma, session.user.companyId)).map((t) => ({
              id: t.id,
              label: t.label,
              description: t.description ?? "",
            }))}
            processResources={PROCESS_RESOURCES}
            currency={companyLocale.currency}
          />
        </CardContent>
      </Card>
    </div>
  );
}
