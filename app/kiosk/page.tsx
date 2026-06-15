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

// Kiosk-Startbildschirm: Mitarbeiter-Kacheln mit LIVE-Status (eingestempelt /
// Pause / abwesend / ausgestempelt). So sieht jeder im Werkstatt sofort, dass
// die Zeit weiterläuft, auch wenn niemand auf der Action-Page eingeloggt ist.
//
// Sicherheits-Schichten:
//   1. Wenn die Firma ein Kiosk-Passwort gesetzt hat UND das Tablet noch
//      nicht freigeschaltet ist → KioskLockScreen.
//   2. Sonst: Mitarbeiter-Liste der Firma (gefiltert auf companyId).
//
// Datenschutz: Nur öffentliche Information (Name + Status + "seit HH:MM"-
// Zeit). KEIN Saldo, keine Sollstunden, keine Wochenstunden.

// Always render fresh — backs a real-time UI.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KioskHomePage() {
  const tApp = await getTranslations("app");
  const tKiosk = await getTranslations("kiosk");

  // ─── Account-Pfad (KIOSK_OPERATOR) ────────────────────────────
  // Wenn ein Tablet-Konto via NextAuth eingeloggt ist, ersetzt das den
  // anonymen Kiosk-Lock-Mechanismus komplett — die Firma kommt aus dem
  // User-Profil, der Lock-Screen wird übersprungen.
  const session = await auth();
  const accountCompanyId =
    session?.user && isKioskOperator(session.user.role)
      ? session.user.companyId
      : null;

  const lockedCompanyId = accountCompanyId ?? (await readKioskLock());

  // ─── Lock-Screen-Pfad (anonymes Tablet) ───────────────────────
  // Wenn es überhaupt eine Firma mit gesetztem Kiosk-Passwort gibt UND
  // das aktuelle Tablet nicht freigeschaltet ist → Lock-Screen zeigen.
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
    // Keine Firma hat ein Kiosk-Passwort gesetzt → wie bisher offen
    // (Single-Tenant-Default für habb global vor dem Multi-Tenant-Setup).
  }

  // ─── Tenant-isolierter Pfad ──────────────────────────────────
  // companyId entweder aus Account-Session, Lock-Cookie ODER (wenn keiner
  // gesetzt) aus der einzigen existierenden Firma.
  let companyId: string | null = lockedCompanyId;
  if (!companyId) {
    const all = await prisma.company.findMany({ select: { id: true }, take: 2 });
    companyId = all.length === 1 ? all[0].id : null;
  }
  if (!companyId) {
    // Fallback: keine Firma, leerer State
    return (
      <main className="min-h-screen bg-habb-paper p-6 flex items-center justify-center">
        <p className="text-habb-muted">No company configured.</p>
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
    select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  const serverNow = new Date();
  const todayDateStr = localDateString(serverNow);
  const todayMidnightUtc = new Date(`${todayDateStr}T00:00:00.000Z`);

  // Pro Mitarbeiter den Tages-Status + letzte CLOCK_IN/BREAK_START laden.
  // Wir batchen die TimePunch-Query damit nicht N+1.
  const [summaries, todayPunches, activeAbsences, company] = await Promise.all([
    Promise.all(
      employees.map((e) =>
        getEmployeeKioskSummary(e.id, serverNow, { expectedCompanyId: companyId! }),
      ),
    ),
    prisma.timePunch.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        occurredAt: { gte: todayMidnightUtc },
      },
      orderBy: { occurredAt: "asc" },
      select: { employeeId: true, type: true, occurredAt: true },
    }),
    prisma.absence.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        archivedAt: null,
        deletedAt: null,
        status: "APPROVED",
        startDate: { lte: serverNow },
        endDate: { gte: todayMidnightUtc },
      },
      include: { absenceType: true },
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

  // Pro Mitarbeiter: letzte CLOCK_IN bzw. BREAK_START rauspicken.
  const punchesByEmp = new Map<string, typeof todayPunches>();
  for (const p of todayPunches) {
    const list = punchesByEmp.get(p.employeeId) ?? [];
    list.push(p);
    punchesByEmp.set(p.employeeId, list);
  }
  const absenceByEmp = new Map<string, (typeof activeAbsences)[number]>();
  for (const a of activeAbsences) absenceByEmp.set(a.employeeId, a);

  const tiles = employees.map((e, idx) => {
    const summary = summaries[idx];
    const today = summary.today;
    const empPunches = punchesByEmp.get(e.id) ?? [];

    const absence = absenceByEmp.get(e.id);
    let status: KioskStatus;
    if (absence) status = "ABSENT";
    else if (today?.isOnBreak) status = "BREAK";
    else if (today?.isOpen) status = "IN";
    else status = "OUT";

    let sinceIso: string | null = null;
    let sinceLabel: string | null = null;
    if (status === "IN") {
      let lastIn: Date | null = null;
      for (const p of empPunches) {
        if (p.type === "CLOCK_IN") lastIn = p.occurredAt;
        else if (p.type === "CLOCK_OUT") lastIn = null;
      }
      if (lastIn) {
        sinceIso = lastIn.toISOString();
        sinceLabel = formatTimeLocal(lastIn);
      }
    } else if (status === "BREAK") {
      let lastBreakStart: Date | null = null;
      for (const p of empPunches) {
        if (p.type === "BREAK_START") lastBreakStart = p.occurredAt;
        else if (p.type === "BREAK_END") lastBreakStart = null;
      }
      if (lastBreakStart) {
        sinceIso = lastBreakStart.toISOString();
        sinceLabel = formatTimeLocal(lastBreakStart);
      }
    }

    let todayWorkedLabel: string | null = null;
    if (status === "OUT" && today && today.workedMinutes > 0) {
      const h = Math.floor(today.workedMinutes / 60);
      const m = today.workedMinutes % 60;
      todayWorkedLabel = `${h}:${m.toString().padStart(2, "0")} h`;
    }

    return {
      employeeId: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      employeeNumber: e.employeeNumber,
      status,
      sinceIso,
      sinceLabel,
      absenceLabel: absence?.absenceType.labelDe ?? null,
      todayWorkedLabel,
    };
  });

  return (
    <main className="min-h-screen bg-habb-paper p-6 md:p-10">
      <AutoRefresh intervalMs={30_000} />
      <div className="max-w-6xl mx-auto">
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
                  className="text-sm text-habb-muted hover:text-habb-ink hover:underline"
                >
                  Admin
                </Link>
              )}
            </>
          }
        />

        <p className="mt-6 text-lg text-habb-muted">
          {tKiosk("selectEmployee")}
        </p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tiles.map((t) => (
            <KioskEmployeeTile
              key={t.employeeId}
              {...t}
              serverNowIso={serverNow.toISOString()}
            />
          ))}
        </div>

        <KioskBrandFooter />
      </div>
    </main>
  );
}
