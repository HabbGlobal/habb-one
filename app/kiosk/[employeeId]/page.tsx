import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { readKioskLock } from "@/lib/kiosk-lock";
import { PinPad } from "./PinPad";
import { KioskBrandHeader } from "@/components/kiosk/KioskBrandHeader";
import { KioskBrandFooter } from "@/components/kiosk/KioskBrandFooter";
import { ArrowLeft } from "lucide-react";

export default async function KioskPinPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const tKiosk = await getTranslations("kiosk");
  const { employeeId } = await params;

  // When the tablet is unlocked for a specific company, only employees from
  // that company may be accessed.
  const lockedCompanyId = await readKioskLock();

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isActive: true,
      companyId: true,
      company: {
        select: { id: true, name: true, logoMimeType: true, updatedAt: true },
      },
    },
  });
  if (!employee || !employee.isActive) notFound();
  if (lockedCompanyId && employee.companyId !== lockedCompanyId) {
    redirect("/kiosk");
  }

  return (
    <main className="min-h-screen bg-habb-paper p-6 md:p-10">
      <div className="max-w-md mx-auto">
        <KioskBrandHeader
          companyName={employee.company.name}
          companyId={employee.company.id}
          hasLogo={!!employee.company.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={employee.company.updatedAt.getTime().toString()}
          showWordmark={false}
        />

        <Card className="mt-6 border-habb-line shadow-sm">
          <CardContent className="p-8 space-y-6">
            <div className="text-center">
              <p className="text-sm text-habb-muted">{employee.firstName}</p>
              <h2 className="text-3xl font-semibold tracking-tight text-habb-ink">
                {employee.lastName}
              </h2>
            </div>
            <p className="text-center text-lg text-habb-ink">{tKiosk("enterPin")}</p>
            <PinPad
              employeeId={employee.id}
              wrongPinMessage={tKiosk("wrongPin")}
              lockedMessage={tKiosk("locked")}
            />
            <Link
              href="/kiosk"
              className="inline-flex items-center justify-center gap-1.5 w-full rounded-md border border-habb-line bg-white px-4 py-2 text-sm font-medium text-habb-ink shadow-sm transition hover:bg-habb-paper"
            >
              <ArrowLeft className="h-4 w-4" />
              {tKiosk("back")}
            </Link>
          </CardContent>
        </Card>

        <KioskBrandFooter />
      </div>
    </main>
  );
}
