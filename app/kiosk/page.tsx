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
      <main className="flex min-h-screen items-center justify-center bg-habb-black p-6">
        <div className="rounded-xl border border-neutral-800 bg-habb-ink px-6 py-5 text-center shadow-sm">
          <p className="text-sm text-neutral-400">No company configured.</p>
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
    <main className="min-h-screen bg-habb-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-habb-red/20 via-habb-black to-habb-black text-white p-4 md:p-8">
      <AutoRefresh intervalMs={30_000} />

      <div className="mx-auto max-w-6xl">
        <KioskBrandHeader
          companyName={company?.name ?? tApp("company")}
          companyId={companyId}
          hasLogo={!!company?.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={company?.updatedAt?.getTime().toString()}
          showWordmark={false}
          theme="dark"
          rightSlot={
            <div className="flex items-center gap-4">
              <LanguageSwitcher />

              {lockedCompanyId && (
                <KioskLogoutButton mode={accountCompanyId ? "account" : "lock"} theme="dark" />
              )}

              {!accountCompanyId && (
                <Link
                  href="/login"
                  className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:bg-white/10 hover:text-white"
                >
                  Admin
                </Link>
              )}
            </div>
          }
        />

        <section className="mt-12 mb-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-habb-red mb-2">
                Workshop Kiosk
              </p>

              <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white mb-2 drop-shadow-lg">
                {tKiosk("selectEmployee")}
              </h1>

              <p className="text-xl text-neutral-300 font-medium">
                Tap your name to continue.
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

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <KioskEmployeeTile
              key={tile.employeeId}
              {...tile}
              serverNowIso={serverNow.toISOString()}
            />
          ))}
        </div>

        <KioskBrandFooter theme="dark" />
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
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
    danger: "bg-habb-red/10 text-habb-red border border-habb-red/20 shadow-[0_0_15px_rgba(218,14,21,0.1)]",
    neutral: "bg-white/5 text-neutral-400 border border-white/10",
  }[tone];

  return (
    <div className={`min-w-[4rem] rounded-2xl px-4 py-3 backdrop-blur-md ${toneClass} text-center`}>
      <p className="text-3xl font-black leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-widest opacity-80">
        {label}
      </p>
    </div>
  );
}