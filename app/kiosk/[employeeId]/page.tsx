import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { readKioskLock } from "@/lib/kiosk-lock";
import { PinPad } from "./PinPad";
import { KioskBrandHeader } from "@/components/kiosk/KioskBrandHeader";
import { KioskBrandFooter } from "@/components/kiosk/KioskBrandFooter";
import { KioskThemeToggle } from "@/components/kiosk/KioskThemeToggle";
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

  const initials = `${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase();

  return (
    <main className="relative min-h-screen overflow-hidden bg-habb-paper text-habb-ink dark:bg-habb-black dark:text-white">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-habb-red/10 blur-3xl dark:bg-habb-red/25" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-habb-red/10 blur-3xl dark:bg-habb-red/20" />

      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col p-6 md:p-10">
        <KioskBrandHeader
          companyName={employee.company.name}
          companyId={employee.company.id}
          hasLogo={!!employee.company.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={employee.company.updatedAt.getTime().toString()}
          showWordmark={false}
          rightSlot={<KioskThemeToggle />}
        />

        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <div className="relative mb-5">
            <div className="absolute inset-0 scale-125 rounded-full bg-habb-red/25 blur-2xl dark:bg-habb-red/40" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-habb-red/30 bg-white text-3xl font-black text-habb-ink shadow-xl dark:border-habb-red/40 dark:bg-white/5 dark:text-white dark:backdrop-blur-xl">
              {initials}
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-lg font-bold tracking-widest text-habb-red uppercase">{employee.firstName}</p>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-habb-ink dark:text-white dark:drop-shadow-2xl">
              {employee.lastName}
            </h2>
          </div>

          <div className="mt-8 w-full max-w-sm p-6 rounded-3xl border border-habb-line bg-white shadow-xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl dark:shadow-2xl">
            <p className="text-center text-lg text-habb-muted dark:text-neutral-300 font-medium mb-6">{tKiosk("enterPin")}</p>
            <PinPad
              employeeId={employee.id}
              wrongPinMessage={tKiosk("wrongPin")}
              lockedMessage={tKiosk("locked")}
            />
          </div>

          <div className="mt-6 w-full max-w-sm">
            <Link
              href="/kiosk"
              className="inline-flex items-center justify-center gap-2 w-full rounded-2xl border border-habb-line bg-white px-6 py-3 text-base font-bold text-habb-muted transition-all hover:text-habb-ink dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <ArrowLeft className="h-6 w-6" />
              {tKiosk("back")}
            </Link>
          </div>
        </div>

        <KioskBrandFooter />
      </div>
    </main>
  );
}
