import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { customerDisplayName } from "@/lib/dto/customer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteWizard } from "../QuoteWizard";
import { loadActiveTemplates } from "@/lib/templates/load";
import { PROCESS_RESOURCES } from "@/lib/order/process-templates";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "quotes.write")) redirect("/admin/quotes");

  const customers = await prisma.customer.findMany({
    where: {
      companyId: session.user.companyId,
      archivedAt: null,
      deletedAt: null,
    },
    orderBy: [{ companyName: "asc" }, { customerNumber: "desc" }],
    include: { contacts: { where: { isPrimary: true }, take: 1 } },
  });

  const customerOptions = customers.map((c) => ({
    id: c.id,
    label: customerDisplayName(c),
    customerNumber: c.customerNumber,
  }));

  const templates = (await loadActiveTemplates(prisma, session.user.companyId)).map(
    (t) => ({
      id: t.id,
      label: t.label,
      description: t.description ?? "",
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Neue Offerte</h1>
        <p className="text-sm text-muted-foreground">
          Status startet als <strong>Entwurf</strong>. Wird beim Versenden eingefroren.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Offerten-Daten</CardTitle>
        </CardHeader>
        <CardContent>
          <QuoteWizard
            mode="create"
            customers={customerOptions}
            templates={templates}
            processResources={PROCESS_RESOURCES}
          />
        </CardContent>
      </Card>
    </div>
  );
}
