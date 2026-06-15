import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { customerDisplayName } from "@/lib/dto/customer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceForm } from "../InvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "invoices.write")) redirect("/admin/invoices");

  const [customers, company] = await Promise.all([
    prisma.customer.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
      },
      orderBy: [{ companyName: "asc" }, { customerNumber: "desc" }],
      include: { contacts: { where: { isPrimary: true }, take: 1 } },
    }),
    prisma.company.findUniqueOrThrow({
      where: { id: session.user.companyId },
      select: { invoiceDefaultVatRate: true, invoicePaymentTerms: true },
    }),
  ]);

  const customerOptions = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    customerNumber: c.customerNumber,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Invoice</h1>
        <p className="text-sm text-muted-foreground">
          Status starts as <strong>Draft</strong>. On sending, a QR reference is
          assigned — then immutable.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Data</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceForm
            mode="create"
            customers={customerOptions}
            defaults={{
              vatRate: Number(company.invoiceDefaultVatRate),
              paymentTerms: company.invoicePaymentTerms,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
