import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EmployeeForm, type EmployeeInitial } from "../EmployeeForm";

export default async function NewEmployeePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const t = await getTranslations("employees");

  const [company, areas] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: session.user.companyId },
      select: { defaultWeeklyHours: true, defaultVacationDaysYear: true, defaultBreakMinutes: true, country: true },
    }),
    prisma.workArea.findMany({
      where: { companyId: session.user.companyId, archivedAt: null, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, colorHex: true },
    }),
  ]);
  const weekly = company.defaultWeeklyHours;
  const dailyTarget = Math.round((weekly / 5) * 100) / 100;

  const initial: EmployeeInitial = {
    employeeNumber: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    preferredLanguage: "de",
    isActive: true,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    dateOfBirth: "",
    address: "",
    ahvNumber: "",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 100,
    weeklyTargetHours: weekly,
    defaultBreakMinutes: company.defaultBreakMinutes,
    annualVacationDays: company.defaultVacationDaysYear,
    initialOvertimeHours: 0,
    initialVacationDays: 0,
    notes: "",
    scheduleDays: {
      MON: dailyTarget,
      TUE: dailyTarget,
      WED: dailyTarget,
      THU: dailyTarget,
      FRI: dailyTarget,
      SAT: 0,
      SUN: 0,
    },
    workAreaIds: [],
    skills: [],
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("new")}</h1>
      <EmployeeForm
        initial={initial}
        mode={{ kind: "create" }}
        submitLabel={t("saveAndReturn")}
        companyWeeklyHours={weekly}
        availableAreas={areas}
        country={company.country}
      />
    </div>
  );
}
