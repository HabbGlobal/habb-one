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
    <main className="min-h-screen bg-habb-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-habb-red/20 via-habb-black to-habb-black text-white p-6 md:p-10">
      <div className="max-w-md mx-auto">
        <KioskBrandHeader
          companyName={employee.company.name}
          companyId={employee.company.id}
          hasLogo={!!employee.company.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={employee.company.updatedAt.getTime().toString()}
          showWordmark={false}
          theme="dark"
        />

        <div className="mt-8 mb-4">
          <div className="text-center space-y-1">
            <p className="text-lg font-bold tracking-widest text-habb-red uppercase">{employee.firstName}</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-2xl">
              {employee.lastName}
            </h2>
          </div>
          
          <div className="mt-8 max-w-sm mx-auto p-6 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
            <p className="text-center text-lg text-neutral-300 font-medium mb-6">{tKiosk("enterPin")}</p>
            <PinPad
              employeeId={employee.id}
              wrongPinMessage={tKiosk("wrongPin")}
              lockedMessage={tKiosk("locked")}
            />
          </div>

          <div className="mt-6 max-w-sm mx-auto">
            <Link
              href="/kiosk"
              className="inline-flex items-center justify-center gap-2 w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-6 py-3 text-base font-bold text-neutral-300 transition-all hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-6 w-6" />
              {tKiosk("back")}
            </Link>
          </div>
        </div>

        <KioskBrandFooter theme="dark" />
      </div>
    </main>
  );
}
