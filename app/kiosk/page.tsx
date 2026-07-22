import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AutoRefresh } from "@/components/AutoRefresh";
import { readKioskLock } from "@/lib/kiosk-lock";
import { auth } from "@/lib/auth";
import { isKioskOperator } from "@/lib/roles";
import { buildEmployeeTiles, type KioskStatus } from "@/lib/kiosk-tiles";
import { KioskEmployeeTile } from "./KioskEmployeeTile";
import { KioskLockScreen } from "./KioskLockScreen";
import { KioskLogoutButton } from "./KioskLogoutButton";
import { KioskBrandHeader } from "@/components/kiosk/KioskBrandHeader";
import { KioskBrandFooter } from "@/components/kiosk/KioskBrandFooter";
import { KioskThemeToggle } from "@/components/kiosk/KioskThemeToggle";

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
      <main className="flex min-h-screen items-center justify-center bg-habb-paper p-6 dark:bg-habb-black">
        <div className="rounded-xl border border-habb-line bg-white px-6 py-5 text-center shadow-sm dark:border-neutral-800 dark:bg-habb-ink">
          <p className="text-sm text-habb-muted dark:text-neutral-400">No company configured.</p>
        </div>
      </main>
    );
  }

  const serverNow = new Date();

  const [{ employees: tiles }, company] = await Promise.all([
    buildEmployeeTiles(companyId, serverNow),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        logoMimeType: true,
        updatedAt: true,
      },
    }),
  ]);

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
    <main className="min-h-screen bg-habb-paper bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-habb-red/5 via-habb-paper to-habb-paper text-habb-ink p-3 dark:from-habb-red/20 dark:via-habb-black dark:to-habb-black dark:bg-habb-black dark:text-white md:p-6">
      <AutoRefresh intervalMs={30_000} />

      <div className="mx-auto max-w-6xl">
        <KioskBrandHeader
          companyName={company?.name ?? tApp("company")}
          companyId={companyId}
          hasLogo={!!company?.logoMimeType}
          subtitle={tKiosk("title")}
          logoVersion={company?.updatedAt?.getTime().toString()}
          showWordmark={false}
          rightSlot={
            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <KioskThemeToggle />

              {lockedCompanyId && (
                <KioskLogoutButton mode={accountCompanyId ? "account" : "lock"} />
              )}

              {!accountCompanyId && (
                <Link
                  href="/login"
                  className="rounded-xl border border-habb-line bg-white px-4 py-2 text-sm font-semibold text-habb-muted transition-all hover:text-habb-ink dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:backdrop-blur-md dark:hover:bg-white/10 dark:hover:text-white"
                >
                  Admin
                </Link>
              )}
            </div>
          }
        />

        <section className="mt-6 mb-4">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-habb-red mb-1">
                Workshop Kiosk
              </p>

              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-habb-ink dark:text-white mb-1 dark:drop-shadow-lg">
                {tKiosk("selectEmployee")}
              </h1>

              <p className="text-sm text-habb-muted dark:text-neutral-300 font-medium">
                Tap your name to continue.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              <StatusCount label="In" value={statusCounts.IN} tone="success" />
              <StatusCount label="Break" value={statusCounts.BREAK} tone="warning" />
              <StatusCount label="Out" value={statusCounts.OUT} tone="neutral" />
              <StatusCount label="Absent" value={statusCounts.ABSENT} tone="danger" />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {tiles.map((tile) => (
            <KioskEmployeeTile
              key={tile.employeeId}
              {...tile}
              serverNowIso={serverNow.toISOString()}
            />
          ))}
        </div>

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
    success: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400 dark:shadow-[0_0_15px_rgba(16,185,129,0.1)]",
    warning: "bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:text-amber-400 dark:shadow-[0_0_15px_rgba(245,158,11,0.1)]",
    danger: "bg-habb-red/10 text-habb-red border border-habb-red/20 dark:shadow-[0_0_15px_rgba(218,14,21,0.1)]",
    neutral: "bg-habb-paper text-habb-muted border border-habb-line dark:bg-white/5 dark:text-neutral-400 dark:border-white/10",
  }[tone];

  return (
    <div className={`min-w-[3.5rem] rounded-xl px-3 py-2 dark:backdrop-blur-md ${toneClass} text-center`}>
      <p className="text-2xl font-black leading-none tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest opacity-80">
        {label}
      </p>
    </div>
  );
}