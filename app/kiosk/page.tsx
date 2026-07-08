import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getEmployeeKioskSummary } from "@/lib/time/service";
import { formatTimeLocal, localDateString } from "@/lib/time/zone";
import { readKioskLock } from "@/lib/kiosk-lock";
import { auth } from "@/lib/auth";
import { isKioskOperator } from "@/lib/roles";
import { KioskEmployeeTile, type KioskStatus } from "./KioskEmployeeTile";
import { KioskLockScreen } from "./KioskLockScreen";
import { KioskLogoutButton } from "./KioskLogoutButton";
import { KioskBrandHeader } from "@/components/kiosk/KioskBrandHeader";
import { KioskBrandFooter } from "@/components/kiosk/KioskBrandFooter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KioskHomePage() {
  const tApp = await getTranslations("app");
  const tKiosk = await getTranslations("kiosk");

  const session = await auth();

  const accountCompanyId =
    session?.user && isKioskOperator(session.user.role)
      ? session.user.companyId
      : null;

  const lockedCompanyId = accountCompanyId ?? (await readKioskLock());

  if (!lockedCompanyId) {
    const protectedCompanies = await prisma.company.findMany({
      where: { kioskPasswordHash: { not: null } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    if (protectedCompanies.length > 0) {
      return (
        <KioskLockScreen
          appName={tApp("name")}
          companyLabel={tApp("company")}
          companies={protectedCompanies}
        />
      );
    }
  }

  let companyId: string | null = lockedCompanyId;

  if (!companyId) {
    const allCompanies = await prisma.company.findMany({
      select: { id: true },
      take: 2,
    });

    companyId = allCompanies.length === 1 ? allCompanies[0].id : null;
  }

  if (!companyId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-habb-paper p-6">
        <div className="rounded-xl border border-habb-line bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm text-habb-muted">No company configured.</p>
        </div>
      </main>
    );
  }

  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      isActive: true,
      archivedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeNumber: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  const serverNow = new Date();
  const todayDateStr = localDateString(serverNow);
  const todayMidnightUtc = new Date(`${todayDateStr}T00:00:00.000Z`);

  const [summaries, todayPunches, activeAbsences, company] = await Promise.all([
    Promise.all(
      employees.map((employee) =>
        getEmployeeKioskSummary(employee.id, serverNow, {
          expectedCompanyId: companyId!,
        }),
      ),
    ),

    prisma.timePunch.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        occurredAt: { gte: todayMidnightUtc },
      },
      orderBy: { occurredAt: "asc" },
      select: {
        employeeId: true,
        type: true,
        occurredAt: true,
      },
    }),

    prisma.absence.findMany({
      where: {
        employeeId: { in: employees.map((employee) => employee.id) },
        archivedAt: null,
        deletedAt: null,
        status: "APPROVED",
        startDate: { lte: serverNow },
        endDate: { gte: todayMidnightUtc },
      },
      include: {
        absenceType: true,
      },
    }),

    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        logoMimeType: true,
        updatedAt: true,
      },
    }),
  ]);

  const punchesByEmployee = new Map<string, typeof todayPunches>();

  for (const punch of todayPunches) {
    const list = punchesByEmployee.get(punch.employeeId) ?? [];
    list.push(punch);
    punchesByEmployee.set(punch.employeeId, list);
  }

  const absenceByEmployee = new Map<string, (typeof activeAbsences)[number]>();

  for (const absence of activeAbsences) {
    absenceByEmployee.set(absence.employeeId, absence);
  }

  const tiles = employees.map((employee, index) => {
    const summary = summaries[index];
    const today = summary.today;
    const employeePunches = punchesByEmployee.get(employee.id) ?? [];
    const absence = absenceByEmployee.get(employee.id);

    let status: KioskStatus;

    if (absence) {
      status = "ABSENT";
    } else if (today?.isOnBreak) {
      status = "BREAK";
    } else if (today?.isOpen) {
      status = "IN";
    } else {
      status = "OUT";
    }

    let sinceIso: string | null = null;
    let sinceLabel: string | null = null;

    if (status === "IN") {
      let lastClockIn: Date | null = null;

      for (const punch of employeePunches) {
        if (punch.type === "CLOCK_IN") {
          lastClockIn = punch.occurredAt;
        } else if (punch.type === "CLOCK_OUT") {
          lastClockIn = null;
        }
      }

      if (lastClockIn) {
        sinceIso = lastClockIn.toISOString();
        sinceLabel = formatTimeLocal(lastClockIn);
      }
    }

    if (status === "BREAK") {
      let lastBreakStart: Date | null = null;

      for (const punch of employeePunches) {
        if (punch.type === "BREAK_START") {
          lastBreakStart = punch.occurredAt;
        } else if (punch.type === "BREAK_END") {
          lastBreakStart = null;
        }
      }

      if (lastBreakStart) {
        sinceIso = lastBreakStart.toISOString();
        sinceLabel = formatTimeLocal(lastBreakStart);
      }
    }

    let todayWorkedLabel: string | null = null;

    if (status === "OUT" && today && today.workedMinutes > 0) {
      const hours = Math.floor(today.workedMinutes / 60);
      const minutes = today.workedMinutes % 60;
      todayWorkedLabel = `${hours}:${minutes.toString().padStart(2, "0")} h`;
    }

    return {
      employeeId: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      employeeNumber: employee.employeeNumber,
      status,
      sinceIso,
      sinceLabel,
      absenceLabel: absence?.absenceType.labelEn ?? null,
      todayWorkedLabel,
    };
  });

  const statusCounts: Record<KioskStatus, number> = {
    IN: 0,
    BREAK: 0,
    OUT: 0,
    ABSENT: 0,
  };

  for (const tile of tiles) {
    statusCounts[tile.status] += 1;
  }

  return (
    <main className="min-h-screen bg-habb-paper p-4 md:p-8">
      <AutoRefresh intervalMs={30_000} />

      <div className="mx-auto max-w-6xl">
        <KioskBrandHeader
          companyName={company?.name ?? tApp("company")}
          companyId={companyId}
          hasLogo={!!company?.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={company?.updatedAt?.getTime().toString()}
          rightSlot={
            <>
              <LanguageSwitcher />

              {lockedCompanyId && (
                <KioskLogoutButton mode={accountCompanyId ? "account" : "lock"} />
              )}

              {!accountCompanyId && (
                <Link
                  href="/login"
                  className="rounded-lg border border-habb-line bg-white px-3 py-2 text-sm font-medium text-habb-muted transition-colors hover:border-neutral-300 hover:text-habb-ink"
                >
                  Admin
                </Link>
              )}
            </>
          }
        />

        <section className="mt-6 rounded-xl border border-habb-line bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-habb-muted">
                Workshop kiosk
              </p>

              <h1 className="mt-1 text-2xl font-bold tracking-tight text-habb-ink">
                {tKiosk("selectEmployee")}
              </h1>

              <p className="mt-2 text-sm text-habb-muted">
                Tap your name to clock in, start break, end break, or clock out.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <StatusCount label="In" value={statusCounts.IN} tone="success" />
              <StatusCount label="Break" value={statusCounts.BREAK} tone="warning" />
              <StatusCount label="Out" value={statusCounts.OUT} tone="neutral" />
              <StatusCount label="Absent" value={statusCounts.ABSENT} tone="danger" />
            </div>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <KioskEmployeeTile
              key={tile.employeeId}
              {...tile}
              serverNowIso={serverNow.toISOString()}
            />
          ))}
        </section>

        <KioskBrandFooter />
      </div>
    </main>
  );
}

function StatusCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-habb-red",
    neutral: "bg-habb-paper text-habb-muted",
  }[tone];

  return (
    <div className={`min-w-16 rounded-lg px-3 py-2 ${toneClass}`}>
      <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}