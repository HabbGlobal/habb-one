import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NotesEditor } from "@/components/owner/NotesEditor";
import { StammdatenForm } from "@/components/owner/StammdatenForm";
import { DeleteTenantButton } from "@/components/owner/DeleteTenantButton";

export const dynamic = "force-dynamic";

export default async function TenantOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      country: true,
      timezone: true,
      defaultLanguage: true,
      vatNumber: true,
      qrIban: true,
      invoiceCreditorName: true,
      invoicePaymentTerms: true,
      suspendedAt: true,
      suspendedReason: true,
      internalNotes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!tenant) notFound();

  return (
    <div className="space-y-6">
      {tenant.suspendedAt && (
        <section className="rounded-lg border border-habb-red/30 bg-habb-red/5 px-5 py-4 text-sm">
          <p className="font-medium text-habb-red">Tenant suspendiert</p>
          <p className="mt-1 text-habb-red/90">
            Seit {tenant.suspendedAt.toLocaleDateString("de-CH")} —{" "}
            {tenant.suspendedReason || "(keine Begründung dokumentiert)"}
          </p>
          <div className="mt-3 border-t border-habb-red/20 pt-3">
            <p className="mb-2 text-xs text-habb-red/80">
              Endgültige Löschung: entfernt diesen Tenanten samt aller Daten
              und Userkonten unwiderruflich.
            </p>
            <DeleteTenantButton tenantId={tenant.id} tenantName={tenant.name} />
          </div>
        </section>
      )}

      <StammdatenForm
        initial={{
          id: tenant.id,
          name: tenant.name,
          address: tenant.address,
          city: tenant.city,
          country: tenant.country,
          timezone: tenant.timezone,
          defaultLanguage: tenant.defaultLanguage,
          vatNumber: tenant.vatNumber,
          qrIban: tenant.qrIban,
          invoiceCreditorName: tenant.invoiceCreditorName,
          invoicePaymentTerms: tenant.invoicePaymentTerms,
        }}
      />

      <section className="rounded-lg border border-habb-line bg-white px-5 py-3 text-xs text-habb-muted">
        <span className="mr-3">Erstellt: {tenant.createdAt.toLocaleDateString("de-CH")}</span>
        <span>Letzte Änderung: {tenant.updatedAt.toLocaleDateString("de-CH")}</span>
      </section>

      <NotesEditor tenantId={tenant.id} initialNotes={tenant.internalNotes} />
    </div>
  );
}
