import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { EmployeeForm, type EmployeeInitial } from "../EmployeeForm";
import { ResetPinButton } from "./ResetPinButton";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "employees.read")) redirect("/admin");

  // PIN-Reset verlangt Schreibrecht (vgl. requireAdmin in actions.ts).
  // Wer nur Leserecht hat (z.B. PLANNER) darf den Button gar nicht sehen —
  // sonst läuft der Klick in einen unbehandelten "Keine Berechtigung."-
  // Throw und der User sieht nur eine generische Digest-Fehlerseite.
  const canResetPin = hasPermission(session.user.role, "employees.write");

  const { id } = await params;
  const t = await getTranslations("employees");
  // Tenant-Filter: Employee nur finden wenn er zur Session-Company gehört.
  const e = await prisma.employee.findFirst({
    where: { id, companyId: session.user.companyId },
    include: {
      scheduleDays: true,
      workAreas: true,
      skills: true,
      company: { select: { defaultWeeklyHours: true, id: true } },
    },
  });
  if (!e) notFound();

  const areas = await prisma.workArea.findMany({
    where: { companyId: session.user.companyId, archivedAt: null, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, colorHex: true },
  });

  const sched: EmployeeInitial["scheduleDays"] = {
    MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0,
  };
  for (const d of e.scheduleDays) sched[d.weekday] = d.targetHours;
  // Defaults if no schedule rows yet
  if (e.scheduleDays.length === 0) {
    Object.assign(sched, { MON: 8.4, TUE: 8.4, WED: 8.4, THU: 8.4, FRI: 8.4 });
  }

  const initial: EmployeeInitial = {
    employeeNumber: e.employeeNumber,
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email ?? "",
    phone: e.phone ?? "",
    preferredLanguage: e.preferredLanguage as "de" | "en",
    isActive: e.isActive,
    startDate: e.startDate.toISOString().slice(0, 10),
    endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : "",
    dateOfBirth: e.dateOfBirth ? e.dateOfBirth.toISOString().slice(0, 10) : "",
    address: e.address ?? "",
    ahvNumber: e.ahvNumber ?? "",
    employmentType: e.employmentType,
    workloadPercent: e.workloadPercent,
    weeklyTargetHours: e.weeklyTargetHours,
    defaultBreakMinutes: e.defaultBreakMinutes,
    annualVacationDays: e.annualVacationDays,
    initialOvertimeHours: e.initialOvertimeHours,
    initialVacationDays: e.initialVacationDays,
    notes: e.notes ?? "",
    scheduleDays: sched,
    workAreaIds: e.workAreas.map((wa) => wa.workAreaId),
    skills: e.skills.map((s) => ({
      skillCode: s.skillCode,
      level: s.level,
      certifiedUntil: s.certifiedUntil ? s.certifiedUntil.toISOString().slice(0, 10) : "",
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {e.lastName}, {e.firstName}{" "}
          <span className="text-muted-foreground font-normal text-base">#{e.employeeNumber}</span>
        </h1>
        {canResetPin && <ResetPinButton employeeId={e.id} />}
      </div>

      <EmployeeForm
        initial={initial}
        mode={{ kind: "edit", employeeId: id }}
        submitLabel={t("saveAndReturn")}
        companyWeeklyHours={e.company.defaultWeeklyHours}
        availableAreas={areas}
      />
    </div>
  );
}
