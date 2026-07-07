import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { SettingsForm } from "./SettingsForm";
import { InvoiceSettingsForm } from "./InvoiceSettingsForm";
import { CompanyLogoForm } from "./CompanyLogoForm";
import { KioskPasswordForm } from "./KioskPasswordForm";
import { KioskLockTimeoutForm } from "./KioskLockTimeoutForm";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = await getTranslations("settings");
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: session.user.companyId },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <CompanyLogoForm
        hasLogo={!!company.logoData}
        logoVersion={company.updatedAt.getTime().toString()}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("company")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initial={{
              name: company.name,
              address: company.address ?? "",
              city: company.city ?? "",
              country: company.country,
              timezone: company.timezone,
              defaultWeeklyHours: company.defaultWeeklyHours,
              defaultVacationDaysYear: company.defaultVacationDaysYear,
              defaultBreakMinutes: company.defaultBreakMinutes,
              roundingMinutes: company.roundingMinutes,
              maxDailyHours: company.maxDailyHours,
              maxWeeklyHours: company.maxWeeklyHours,
              highOvertimeHours: company.highOvertimeHours,
              defaultLanguage: company.defaultLanguage as "de" | "en",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Banking & Invoice Defaults
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceSettingsForm
            initial={{
              qrIban: company.qrIban ?? "",
              invoiceCreditorName: company.invoiceCreditorName ?? "",
              vatNumber: company.vatNumber ?? "",
              invoicePaymentTerms: company.invoicePaymentTerms ?? 30,
              invoiceDefaultVatRate: Number(company.invoiceDefaultVatRate ?? 8.1),
            }}
          />
        </CardContent>
      </Card>

      <KioskPasswordForm hasKioskPassword={!!company.kioskPasswordHash} />

      <KioskLockTimeoutForm
        currentMinutes={company.kioskLockTimeoutMinutes}
      />
    </div>
  );
}
