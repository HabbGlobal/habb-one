// Seed data for local development.
//   - 1 company (habb global Spritzwerk AG)
//   - 1 admin user
//   - 1 secretary user
//   - 5 employees with varied employment models
//   - Bern cantonal holidays for the current year
//   - Default absence types
//   - A handful of past time punches for the last week so the dashboard
//     and reports show real data
//
// Run via:  npm run db:seed
// Reset:    npm run db:reset

import { PrismaClient, type WeekDay } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@habbglobal.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

async function main() {
  console.log("→ Seeding…");

  const company = await prisma.company.upsert({
    where: { id: "habb global" },
    create: {
      id: "habb global",
      name: "habb global Spritzwerk AG",
      address: "Industriestrasse 1",
      city: "Burgdorf",
      country: "CH",
      timezone: "Europe/Zurich",
      defaultWeeklyHours: 42.0,
      defaultVacationDaysYear: 25,
      defaultBreakMinutes: 30,
      roundingMinutes: 0,
      maxDailyHours: 10,
      maxWeeklyHours: 50,
      highOvertimeHours: 40,
      defaultLanguage: "de",
    },
    update: {},
  });

  // Super-Admin (System-Administrator — kann Rollen-Matrix bearbeiten)
  const SUPERADMIN_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@habbglobal.com";
  const SUPERADMIN_PASSWORD = process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin1234";
  await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    create: {
      companyId: company.id,
      email: SUPERADMIN_EMAIL,
      name: "Super-Admin",
      passwordHash: await bcrypt.hash(SUPERADMIN_PASSWORD, 10),
      role: "SUPERADMIN",
      preferredLanguage: "de",
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  // CEO / Geschäftsleitung (rolle ADMIN)
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      companyId: company.id,
      email: ADMIN_EMAIL,
      name: "CEO / Geschäftsleitung",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: "ADMIN",
      preferredLanguage: "de",
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  // Sekretärin (rolle PLANNER)
  await prisma.user.upsert({
    where: { email: "sekretariat@habbglobal.com" },
    create: {
      companyId: company.id,
      email: "sekretariat@habbglobal.com",
      name: "Sekretärin",
      passwordHash: await bcrypt.hash("sekretariat1234", 10),
      role: "PLANNER",
      preferredLanguage: "de",
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  // Produktionsmitarbeiter-Demo (rolle EMPLOYEE) — optional Login,
  // primär arbeiten Werkstatt-Mitarbeiter via Kiosk-PIN.
  await prisma.user.upsert({
    where: { email: "produktion@habbglobal.com" },
    create: {
      companyId: company.id,
      email: "produktion@habbglobal.com",
      name: "Produktionsmitarbeiter (Demo)",
      passwordHash: await bcrypt.hash("produktion1234", 10),
      role: "EMPLOYEE",
      preferredLanguage: "de",
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  // Default absence types
  const types = [
    { key: "vacation", labelDe: "Ferien", labelEn: "Vacation", category: "VACATION" as const, isPaid: true, reducesTarget: true, countsAsWorked: false, requiresApproval: true, colorHex: "#2563eb" },
    { key: "sickness", labelDe: "Krankheit", labelEn: "Sickness", category: "SICKNESS" as const, isPaid: true, reducesTarget: true, countsAsWorked: false, requiresApproval: false, colorHex: "#9333ea" },
    { key: "accident", labelDe: "Unfall", labelEn: "Accident", category: "ACCIDENT" as const, isPaid: true, reducesTarget: true, countsAsWorked: false, requiresApproval: false, colorHex: "#dc2626" },
    { key: "military", labelDe: "Militär/Zivilschutz", labelEn: "Military / civil protection", category: "MILITARY" as const, isPaid: true, reducesTarget: true, countsAsWorked: false, requiresApproval: false, colorHex: "#65a30d" },
    { key: "doctor", labelDe: "Arzttermin", labelEn: "Doctor visit", category: "DOCTOR" as const, isPaid: true, reducesTarget: false, countsAsWorked: true, requiresApproval: false, colorHex: "#059669" },
    { key: "unpaid", labelDe: "Unbezahlt", labelEn: "Unpaid leave", category: "UNPAID" as const, isPaid: false, reducesTarget: true, countsAsWorked: false, requiresApproval: true, colorHex: "#6b7280" },
    { key: "compensation", labelDe: "Kompensation/Zeitausgleich", labelEn: "Compensation", category: "COMPENSATION" as const, isPaid: true, reducesTarget: true, countsAsWorked: false, requiresApproval: false, colorHex: "#0891b2" },
    { key: "other", labelDe: "Sonstiges", labelEn: "Other", category: "OTHER" as const, isPaid: false, reducesTarget: false, countsAsWorked: false, requiresApproval: false, colorHex: "#a3a3a3" },
  ];
  for (const t of types) {
    await prisma.absenceType.upsert({
      where: { companyId_key: { companyId: company.id, key: t.key } },
      create: { companyId: company.id, ...t },
      update: t,
    });
  }

  // Default work areas for habb global Spritzwerk.
  // Capacity rules:
  //   - Sandstrahlen, Pulvern: one machine each → max 1 employee per day
  //   - Vor- & Nachbereitung: must always be staffed by ≥ 2 people
  //   - All others: no fixed bounds
  const areas = [
    { name: "Sandstrahlen", colorHex: "#f59e0b", sortOrder: 1, minEmployeesPerDay: null, maxEmployeesPerDay: 1 },
    { name: "Nasslackieren", colorHex: "#3b82f6", sortOrder: 2, minEmployeesPerDay: null, maxEmployeesPerDay: null },
    { name: "Pulvern", colorHex: "#10b981", sortOrder: 3, minEmployeesPerDay: null, maxEmployeesPerDay: 1 },
    { name: "Vor- & Nachbereitung", colorHex: "#8b5cf6", sortOrder: 4, minEmployeesPerDay: 2, maxEmployeesPerDay: null },
    { name: "Lieferung", colorHex: "#ef4444", sortOrder: 5, minEmployeesPerDay: null, maxEmployeesPerDay: null },
  ];
  for (const a of areas) {
    await prisma.workArea.upsert({
      where: { companyId_name: { companyId: company.id, name: a.name } },
      create: { companyId: company.id, ...a },
      update: {
        colorHex: a.colorHex,
        sortOrder: a.sortOrder,
        minEmployeesPerDay: a.minEmployeesPerDay,
        maxEmployeesPerDay: a.maxEmployeesPerDay,
      },
    });
  }

  // ─────────────────────────────────────────
  // ERP Phase 1 — Maschinen-Park, System-Parameter
  // ─────────────────────────────────────────

  const sandArea = await prisma.workArea.findFirstOrThrow({
    where: { companyId: company.id, name: "Sandstrahlen" },
  });
  const paintArea = await prisma.workArea.findFirstOrThrow({
    where: { companyId: company.id, name: "Nasslackieren" },
  });
  const powderArea = await prisma.workArea.findFirstOrThrow({
    where: { companyId: company.id, name: "Pulvern" },
  });

  // Default-Arbeitszeiten Mo–Fr 07:30–12:00 + 13:00–17:00 (Mittagspause).
  const defaultWorkingHours = {
    mon: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
    tue: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
    wed: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
    thu: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
    fri: [{ from: "07:30", to: "12:00" }, { from: "13:00", to: "17:00" }],
    sat: [],
    sun: [],
  };

  const machineSeeds = [
    {
      name: "Sandstrahlkabine 1",
      type: "BLAST_CABIN" as const,
      workAreaId: sandArea.id,
      maxLengthMm: 6000, maxWidthMm: 3000, maxHeightMm: 4000,
    },
    {
      name: "Lackierkabine 1",
      type: "PAINT_CABIN" as const,
      workAreaId: paintArea.id,
      maxLengthMm: 6000, maxWidthMm: 3000, maxHeightMm: 4000,
    },
    {
      name: "Pulverkabine 1",
      type: "POWDER_CABIN" as const,
      workAreaId: powderArea.id,
      maxLengthMm: 5000, maxWidthMm: 5000, maxHeightMm: 4000,
    },
    {
      name: "Einbrennofen 1",
      type: "CURING_OVEN" as const,
      workAreaId: powderArea.id,
      maxLengthMm: 7000, maxWidthMm: 4000, maxHeightMm: 4000,
    },
  ];
  for (const m of machineSeeds) {
    await prisma.machine.upsert({
      where: { name: m.name },
      create: {
        ...m,
        companyId: company.id,
        isActive: true,
        workingHours: defaultWorkingHours,
      },
      update: {
        type: m.type,
        workAreaId: m.workAreaId,
        maxLengthMm: m.maxLengthMm,
        maxWidthMm: m.maxWidthMm,
        maxHeightMm: m.maxHeightMm,
      },
    });
  }

  // System-Parameter: jeder Wert aus Sektion 2 des ERP-Briefings.
  const { PARAMETER_SEEDS } = await import(
    "../lib/domain/parameters/seeds"
  );
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: ADMIN_EMAIL },
  });
  for (const seed of PARAMETER_SEEDS) {
    const valueAsString = String(seed.defaultValue);
    await prisma.systemParameter.upsert({
      where: { companyId_key: { companyId: company.id, key: seed.key } },
      create: {
        companyId: company.id,
        key: seed.key,
        category: seed.category,
        subCategory: seed.subCategory ?? null,
        label: seed.label,
        description: seed.description ?? null,
        valueType: seed.valueType,
        currentValue: valueAsString,
        defaultValue: valueAsString,
        unit: seed.unit ?? null,
        minValue: seed.minValue ?? null,
        maxValue: seed.maxValue ?? null,
        step: seed.step ?? null,
        affectsFormula: seed.affectsFormula ?? null,
        updatedById: adminUser.id,
      },
      // On re-seed, refresh metadata (label, min/max) but keep the
      // user's currentValue so manual tunings survive.
      update: {
        category: seed.category,
        subCategory: seed.subCategory ?? null,
        label: seed.label,
        description: seed.description ?? null,
        valueType: seed.valueType,
        defaultValue: valueAsString,
        unit: seed.unit ?? null,
        minValue: seed.minValue ?? null,
        maxValue: seed.maxValue ?? null,
        step: seed.step ?? null,
        affectsFormula: seed.affectsFormula ?? null,
      },
    });
  }

  // Bern cantonal holidays for 2026 (configurable; admin can change later).
  const holidays2026 = [
    { date: "2026-01-01", de: "Neujahr", en: "New Year's Day" },
    { date: "2026-01-02", de: "Berchtoldstag", en: "Berchtold's Day" },
    { date: "2026-04-03", de: "Karfreitag", en: "Good Friday" },
    { date: "2026-04-06", de: "Ostermontag", en: "Easter Monday" },
    { date: "2026-05-01", de: "Tag der Arbeit", en: "Labour Day" },
    { date: "2026-05-14", de: "Auffahrt", en: "Ascension Day" },
    { date: "2026-05-25", de: "Pfingstmontag", en: "Whit Monday" },
    { date: "2026-08-01", de: "Bundesfeier", en: "Swiss National Day" },
    { date: "2026-12-25", de: "Weihnachten", en: "Christmas" },
    { date: "2026-12-26", de: "Stephanstag", en: "St. Stephen's Day" },
  ];
  for (const h of holidays2026) {
    await prisma.holiday.upsert({
      where: { companyId_date: { companyId: company.id, date: new Date(h.date) } },
      create: { companyId: company.id, date: new Date(h.date), nameDe: h.de, nameEn: h.en, fraction: 1 },
      update: { nameDe: h.de, nameEn: h.en },
    });
  }

  // Employees ─ varied profiles
  const employeeSeeds = [
    {
      employeeNumber: "001",
      firstName: "Hans",
      lastName: "Müller",
      employmentType: "MONTHLY_SALARY" as const,
      workloadPercent: 100,
      weeklyTargetHours: 42,
      schedule: { MON: 8.4, TUE: 8.4, WED: 8.4, THU: 8.4, FRI: 8.4, SAT: 0, SUN: 0 },
      annualVacationDays: 25,
      pin: "1234",
    },
    {
      employeeNumber: "002",
      firstName: "Anna",
      lastName: "Keller",
      employmentType: "MONTHLY_SALARY" as const,
      workloadPercent: 80,
      weeklyTargetHours: 33.6,
      schedule: { MON: 8.4, TUE: 8.4, WED: 8.4, THU: 8.4, FRI: 0, SAT: 0, SUN: 0 },
      annualVacationDays: 25,
      pin: "2345",
    },
    {
      employeeNumber: "003",
      firstName: "Stefan",
      lastName: "Bachmann",
      employmentType: "MONTHLY_SALARY" as const,
      workloadPercent: 60,
      weeklyTargetHours: 25.2,
      schedule: { MON: 0, TUE: 6.3, WED: 6.3, THU: 6.3, FRI: 6.3, SAT: 0, SUN: 0 },
      annualVacationDays: 25,
      pin: "3456",
    },
    {
      employeeNumber: "004",
      firstName: "Maria",
      lastName: "Schmid",
      employmentType: "HOURLY_WAGE" as const,
      workloadPercent: null,
      weeklyTargetHours: null,
      schedule: { MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0 },
      annualVacationDays: 0,
      pin: "4567",
    },
    {
      employeeNumber: "005",
      firstName: "Luca",
      lastName: "Rossi",
      employmentType: "MONTHLY_SALARY" as const,
      workloadPercent: 70,
      weeklyTargetHours: 29.4,
      schedule: { MON: 7, TUE: 7, WED: 0, THU: 7, FRI: 8.4, SAT: 0, SUN: 0 },
      annualVacationDays: 25,
      pin: "5678",
    },
  ];

  const created: { id: string; pin: string; employeeNumber: string }[] = [];
  for (const e of employeeSeeds) {
    const employee = await prisma.employee.upsert({
      where: { companyId_employeeNumber: { companyId: company.id, employeeNumber: e.employeeNumber } },
      create: {
        companyId: company.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        lastName: e.lastName,
        employmentType: e.employmentType,
        workloadPercent: e.workloadPercent,
        weeklyTargetHours: e.weeklyTargetHours,
        defaultBreakMinutes: 30,
        annualVacationDays: e.annualVacationDays,
        startDate: new Date("2024-01-01"),
        pinHash: await bcrypt.hash(e.pin, 10),
        scheduleDays: {
          create: (Object.keys(e.schedule) as WeekDay[]).map((wd) => ({
            weekday: wd,
            targetHours: e.schedule[wd],
          })),
        },
      },
      update: {},
    });
    created.push({ id: employee.id, pin: e.pin, employeeNumber: e.employeeNumber });
  }

  // Sample punches: each Monday-salary employee for the past 7 days.
  const today = new Date();
  for (const e of created) {
    for (let i = 1; i <= 5; i++) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      // Skip weekends
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const dateStr = day.toISOString().slice(0, 10);
      const workDate = new Date(`${dateStr}T00:00:00Z`);
      const inAt = new Date(`${dateStr}T07:30:00Z`);
      const breakStart = new Date(`${dateStr}T12:00:00Z`);
      const breakEnd = new Date(`${dateStr}T12:30:00Z`);
      const outAt = new Date(`${dateStr}T16:30:00Z`);

      const entry = await prisma.timeEntry.upsert({
        where: { employeeId_workDate: { employeeId: e.id, workDate } },
        create: {
          employeeId: e.id,
          workDate,
          status: "CLOSED",
          firstIn: inAt,
          lastOut: outAt,
          workedMinutes: 510,
          breakMinutes: 30,
        },
        update: {},
      });
      // Avoid creating duplicate punches if seed runs twice
      const punchCount = await prisma.timePunch.count({ where: { timeEntryId: entry.id } });
      if (punchCount === 0) {
        await prisma.timePunch.createMany({
          data: [
            { timeEntryId: entry.id, employeeId: e.id, type: "CLOCK_IN", occurredAt: inAt },
            { timeEntryId: entry.id, employeeId: e.id, type: "BREAK_START", occurredAt: breakStart },
            { timeEntryId: entry.id, employeeId: e.id, type: "BREAK_END", occurredAt: breakEnd },
            { timeEntryId: entry.id, employeeId: e.id, type: "CLOCK_OUT", occurredAt: outAt },
          ],
        });
        await prisma.breakEntry.create({
          data: {
            timeEntryId: entry.id,
            startedAt: breakStart,
            endedAt: breakEnd,
            minutes: 30,
          },
        });
      }
    }
  }

  // One sample vacation: Hans Müller (employee 001) is on vacation next week
  const vacationType = await prisma.absenceType.findFirstOrThrow({
    where: { companyId: company.id, key: "vacation" },
  });
  const hans = created.find((c) => c.employeeNumber === "001");
  if (hans) {
    const start = new Date(today);
    start.setDate(today.getDate() + 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 4);
    await prisma.absence.create({
      data: {
        employeeId: hans.id,
        absenceTypeId: vacationType.id,
        startDate: new Date(start.toISOString().slice(0, 10)),
        endDate: new Date(end.toISOString().slice(0, 10)),
        status: "APPROVED",
        decidedAt: new Date(),
      },
    }).catch(() => { });
  }

  // ─────────────────────────────────────────
  // ERP Phase 5b — Process-Templates in DB seeden
  // Stable keys → können wir bei Re-Seed updaten ohne Order/Quote-Bezüge zu
  // brechen. Steps werden bei jedem Re-Seed neu erzeugt (idempotent).
  // ─────────────────────────────────────────
  {
    const { PROCESS_TEMPLATES, PROCESS_RESOURCES } = await import(
      "../lib/order/process-templates"
    );
    for (let i = 0; i < PROCESS_TEMPLATES.length; i++) {
      const tpl = PROCESS_TEMPLATES[i];
      const dbTpl = await prisma.processTemplate.upsert({
        where: { companyId_key: { companyId: company.id, key: tpl.id } },
        create: {
          companyId: company.id,
          key: tpl.id,
          label: tpl.label,
          description: tpl.description,
          sortOrder: i,
        },
        update: {
          label: tpl.label,
          description: tpl.description,
          sortOrder: i,
        },
      });
      // Steps neu schreiben — sicherstellen dass die DB-Templates exakt dem
      // hardcoded Default entsprechen.
      await prisma.processTemplateStep.deleteMany({
        where: { templateId: dbTpl.id },
      });
      for (let s = 0; s < tpl.steps.length; s++) {
        const code = tpl.steps[s];
        const r = PROCESS_RESOURCES[code];
        await prisma.processTemplateStep.create({
          data: {
            templateId: dbTpl.id,
            sequence: (s + 1) * 10,
            processCode: code,
            machineTypeRequired: r.machine,
            skillRequired: r.skill,
            defaultWaitMinutes: r.defaultWaitMinutes,
          },
        });
      }
    }
    console.log(`  ✓ ${PROCESS_TEMPLATES.length} Process-Vorlagen synchronisiert`);
  }

  // ─────────────────────────────────────────
  // ERP Phase 2/3 — Demo customers + orders
  // Idempotent: läuft NICHT wenn KD-DEMO-001 schon existiert.
  // ─────────────────────────────────────────
  const demoMarker = await prisma.customer.findFirst({
    where: { companyId: company.id, customerNumber: "KD-DEMO-001" },
    select: { id: true },
  });
  if (!demoMarker) {
    await seedDemoCustomersAndOrders(company.id, adminUser.id);
  } else {
    console.log("  (Demo-Kunden + Aufträge bereits vorhanden — übersprungen)");
  }

  console.log("\n✓ Seed complete\n");
  console.log("Admin login:");
  console.log(`  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}\n`);
  console.log("Secretary login:");
  console.log(`  sekretariat@habb global.ch / sekretariat1234\n`);
  console.log("Employee PINs (kiosk):");
  for (const e of created) {
    console.log(`  ${e.employeeNumber}: ${e.pin}`);
  }
}

// ─────────────────────────────────────────
// Demo customers + orders (Phase 2/3)
// ─────────────────────────────────────────

/**
 * Seedet 5 Demo-Kunden und 6 Aufträge in unterschiedlichen Status, damit
 * Liste/Detail/Status-Workflow/PDFs sofort durchgespielt werden können.
 *
 * Wichtig: nutzt den echten Calc-Engine + Snapshot-Mechanismus, damit die
 * Demo-Daten dieselben Code-Pfade exerzieren wie Produktiv-Aufträge.
 */
async function seedDemoCustomersAndOrders(companyId: string, adminUserId: string) {
  console.log("→ Seeding ERP-Demo (Kunden + Aufträge)…");

  const { loadAllParams, snapshotKeys } = await import("../lib/domain/parameters/store");
  const { calcProcessStepMinutes, calcOrderItemPrice } = await import(
    "../lib/domain/calculation"
  );
  const { expandTemplate } = await import("../lib/order/process-templates");

  const params = await loadAllParams(prisma, companyId);
  const snapshotKeySet = snapshotKeys(params.keys());
  const fullSerialized = params.serialize();
  const snapshot: Record<string, string> = Object.fromEntries(
    snapshotKeySet.map((k) => [k, fullSerialized[k]]).filter(([, v]) => v != null),
  );

  // ── Kunden ───────────────────────────────────────────
  const customerSeeds = [
    {
      customerNumber: "KD-DEMO-001",
      type: "BUSINESS" as const,
      companyName: "Bauunternehmung Wyss AG",
      vatNumber: "CHE-123.456.789 MWST",
      language: "DE" as const,
      paymentTerms: 30,
      defaultDiscount: 5,
      address: { street: "Lyssachstrasse 42", zip: "3400", city: "Burgdorf", canton: "BE" },
      contact: { firstName: "Peter", lastName: "Wyss", position: "Geschäftsführer", email: "p.wyss@wyssbau.ch", phone: "+41 34 422 12 34" },
    },
    {
      customerNumber: "KD-DEMO-002",
      type: "BUSINESS" as const,
      companyName: "Metallbau Steiner GmbH",
      vatNumber: "CHE-234.567.890 MWST",
      language: "DE" as const,
      paymentTerms: 30,
      defaultDiscount: 0,
      address: { street: "Industriestrasse 7", zip: "3550", city: "Langnau i.E.", canton: "BE" },
      contact: { firstName: "Markus", lastName: "Steiner", position: "Werkstattleiter", email: "info@metallbau-steiner.ch", phone: "+41 34 402 88 11" },
    },
    {
      customerNumber: "KD-DEMO-003",
      type: "PRIVATE" as const,
      companyName: null,
      vatNumber: null,
      language: "DE" as const,
      paymentTerms: 14,
      defaultDiscount: 0,
      address: { street: "Bernstrasse 18", zip: "3433", city: "Schwanden b. Brienz", canton: "BE" },
      contact: { firstName: "Erika", lastName: "Brunner", position: null, email: "erika.brunner@bluewin.ch", phone: "+41 79 123 45 67" },
    },
    {
      customerNumber: "KD-DEMO-004",
      type: "BUSINESS" as const,
      companyName: "Architekturbüro Lauper & Partner",
      vatNumber: "CHE-345.678.901 MWST",
      language: "DE" as const,
      paymentTerms: 30,
      defaultDiscount: 3,
      address: { street: "Spitalgasse 12", zip: "3011", city: "Bern", canton: "BE" },
      contact: { firstName: "Andrea", lastName: "Lauper", position: "Inhaberin", email: "lauper@arch-lauper.ch", phone: "+41 31 311 22 33" },
    },
    {
      customerNumber: "KD-DEMO-005",
      type: "BUSINESS" as const,
      companyName: "Velomanufaktur Rüedi",
      vatNumber: "CHE-456.789.012 MWST",
      language: "DE" as const,
      paymentTerms: 14,
      defaultDiscount: 0,
      address: { street: "Bahnhofstrasse 22", zip: "3110", city: "Münsingen", canton: "BE" },
      contact: { firstName: "Christian", lastName: "Rüedi", position: "Inhaber", email: "chris@rueedi-bikes.ch", phone: "+41 31 721 99 88" },
    },
  ];

  const customers: Record<string, { id: string; addressId: string; contactId: string; defaultDiscount: number }> = {};
  for (const s of customerSeeds) {
    const c = await prisma.customer.create({
      data: {
        companyId,
        customerNumber: s.customerNumber,
        type: s.type,
        companyName: s.companyName,
        vatNumber: s.vatNumber,
        language: s.language,
        paymentTerms: s.paymentTerms,
        defaultDiscount: s.defaultDiscount,
        isActive: true,
        addresses: {
          create: [
            {
              type: "BOTH",
              street: s.address.street,
              zip: s.address.zip,
              city: s.address.city,
              canton: s.address.canton,
              country: "CH",
              isDefault: true,
            },
          ],
        },
        contacts: {
          create: [
            {
              firstName: s.contact.firstName,
              lastName: s.contact.lastName,
              position: s.contact.position,
              email: s.contact.email,
              phone: s.contact.phone,
              isPrimary: true,
            },
          ],
        },
      },
      include: { addresses: true, contacts: true },
    });
    customers[s.customerNumber] = {
      id: c.id,
      addressId: c.addresses[0].id,
      contactId: c.contacts[0].id,
      defaultDiscount: s.defaultDiscount,
    };
  }
  console.log(`  ✓ ${customerSeeds.length} Demo-Kunden erfasst`);

  // ── Aufträge ─────────────────────────────────────────
  // Ein Item-Preset baut aus Vorlage + Stammdaten ein vollständiges Item
  // inkl. berechneter estimatedMinutes pro Schritt.
  type Material = "STEEL_S235" | "STEEL_HIGH_C" | "STAINLESS" | "ALUMINIUM" | "GALVANIZED" | "CAST_IRON" | "OTHER";
  type Complexity = "SIMPLE" | "NORMAL" | "COMPLEX" | "VERY_COMPLEX";

  function buildItemSteps(args: {
    templateId: string;
    surfaceM2: number;
    material: Material;
    complexity: Complexity;
  }) {
    const skeletons = expandTemplate(args.templateId);
    return skeletons.map((s) => ({
      sequence: s.sequence,
      processCode: s.processCode,
      machineTypeRequired: s.machineTypeRequired,
      skillRequired: s.skillRequired,
      waitMinutesAfter: s.waitMinutesAfter,
      estimatedMinutes: calcProcessStepMinutes({
        processCode: s.processCode,
        surfaceM2: args.surfaceM2,
        material: args.material,
        complexity: args.complexity,
        params,
      }),
    }));
  }

  function priceFor(args: {
    items: Array<{ steps: Array<{ processCode: import("@prisma/client").ProcessCode; estimatedMinutes: number; machineTypeRequired: import("@prisma/client").MachineType | null }>; quantity: number }>;
    isExpress: boolean;
    customerDiscountPct: number;
  }) {
    let total = 0;
    for (const it of args.items) {
      const r = calcOrderItemPrice({
        steps: it.steps.map((s) => ({
          processCode: s.processCode,
          estimatedMinutes: s.estimatedMinutes,
          machineType: s.machineTypeRequired ?? undefined,
        })),
        params,
        customerDiscountPct: args.customerDiscountPct,
        isExpress: args.isExpress,
      });
      total += r.totalNetCHF * it.quantity;
    }
    return Math.round(total * 100) / 100;
  }

  const today = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() - n);
    return d;
  };
  const daysAhead = (n: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() + n);
    return d;
  };

  // Pre-build alle Aufträge mit ihren Items + Steps (in-memory),
  // damit wir Preise/Snapshots vorab berechnen können.
  const orderSpecs = [
    {
      orderNumber: "AUF-DEMO-001",
      customer: "KD-DEMO-001",
      status: "DRAFT" as const,
      priority: "NORMAL" as const,
      receivedAt: daysAgo(2),
      promisedAt: daysAhead(14),
      notes: "Standard-Pulverbeschichtung Stahl, Standardbestellung Wyss.",
      customerNotes: "Bitte mit Schutzfolie liefern.",
      items: [
        {
          position: 10,
          description: "Geländerstreben verzinkt (10 Stk)",
          quantity: 10,
          surfaceM2: 1.2,
          weightKg: 14,
          thicknessMm: 5,
          material: "GALVANIZED" as Material,
          complexity: "NORMAL" as Complexity,
          colorCode: "RAL 9005",
          colorSystem: "RAL" as const,
          glossLevel: "MATT" as const,
          template: "powder-standard",
        },
        {
          position: 20,
          description: "Konsolen Stahl S235",
          quantity: 4,
          surfaceM2: 0.8,
          weightKg: 8,
          thicknessMm: 6,
          material: "STEEL_S235" as Material,
          complexity: "SIMPLE" as Complexity,
          colorCode: "RAL 9005",
          colorSystem: "RAL" as const,
          glossLevel: "MATT" as const,
          template: "powder-standard",
        },
      ],
    },
    {
      orderNumber: "AUF-DEMO-002",
      customer: "KD-DEMO-001",
      status: "CONFIRMED" as const,
      priority: "NORMAL" as const,
      receivedAt: daysAgo(7),
      promisedAt: daysAhead(7),
      confirmedAt: daysAgo(5),
      notes: "Wyss — Brückengeländer.",
      items: [
        {
          position: 10,
          description: "Brückengeländer Sektion A",
          quantity: 1,
          surfaceM2: 18,
          weightKg: 240,
          thicknessMm: 8,
          material: "STEEL_S235" as Material,
          complexity: "COMPLEX" as Complexity,
          colorCode: "RAL 7016",
          colorSystem: "RAL" as const,
          glossLevel: "SEMI_GLOSS" as const,
          template: "wet-2k",
        },
      ],
    },
    {
      orderNumber: "AUF-DEMO-003",
      customer: "KD-DEMO-002",
      status: "IN_PROGRESS" as const,
      priority: "HIGH" as const,
      receivedAt: daysAgo(10),
      promisedAt: daysAhead(3),
      confirmedAt: daysAgo(8),
      startedAt: daysAgo(2),
      notes: "Steiner — Eilig, Termin halten.",
      items: [
        {
          position: 10,
          description: "Treppenwangen Aluminium",
          quantity: 6,
          surfaceM2: 2.4,
          weightKg: 22,
          thicknessMm: 4,
          material: "ALUMINIUM" as Material,
          complexity: "NORMAL" as Complexity,
          colorCode: "RAL 9006",
          colorSystem: "RAL" as const,
          glossLevel: "SEMI_GLOSS" as const,
          template: "chem-blast-powder",
        },
      ],
    },
    {
      orderNumber: "AUF-DEMO-004",
      customer: "KD-DEMO-003",
      status: "ON_HOLD" as const,
      priority: "NORMAL" as const,
      receivedAt: daysAgo(14),
      promisedAt: daysAhead(21),
      confirmedAt: daysAgo(12),
      startedAt: daysAgo(8),
      onHoldComment: "Pulverlieferung XY-Polyester verzögert sich um 2 Wochen.",
      notes: "Privatkundin Brunner — Gartenmöbel.",
      items: [
        {
          position: 10,
          description: "Gartenstuhl-Rahmen (Set 4 Stk)",
          quantity: 4,
          surfaceM2: 1.5,
          weightKg: 6,
          thicknessMm: 3,
          material: "STEEL_S235" as Material,
          complexity: "NORMAL" as Complexity,
          colorCode: "RAL 6005",
          colorSystem: "RAL" as const,
          glossLevel: "MATT" as const,
          template: "powder-standard",
        },
      ],
    },
    {
      orderNumber: "AUF-DEMO-005",
      customer: "KD-DEMO-004",
      status: "COMPLETED" as const,
      priority: "NORMAL" as const,
      receivedAt: daysAgo(28),
      promisedAt: daysAgo(7),
      confirmedAt: daysAgo(26),
      startedAt: daysAgo(14),
      completedAt: daysAgo(2),
      notes: "Architekturbüro Lauper — Innentüren-Beschläge.",
      items: [
        {
          position: 10,
          description: "Türgriffe Edelstahl matt",
          quantity: 24,
          surfaceM2: 0.3,
          weightKg: 1,
          thicknessMm: 2,
          material: "STAINLESS" as Material,
          complexity: "SIMPLE" as Complexity,
          colorCode: null,
          colorSystem: null,
          glossLevel: null,
          template: "blast-only",
        },
      ],
    },
    {
      orderNumber: "AUF-DEMO-006",
      customer: "KD-DEMO-005",
      status: "DELIVERED" as const,
      priority: "EXPRESS" as const,
      receivedAt: daysAgo(21),
      promisedAt: daysAgo(7),
      confirmedAt: daysAgo(20),
      startedAt: daysAgo(14),
      completedAt: daysAgo(8),
      deliveredAt: daysAgo(7),
      notes: "Velomanufaktur Rüedi — Custom Velorahmen Express.",
      customerNotes: "Vorsicht beim Verpacken, lackierte Oberfläche!",
      items: [
        {
          position: 10,
          description: "Custom Velorahmen Carbon-Optik",
          quantity: 1,
          surfaceM2: 2.2,
          weightKg: 3,
          thicknessMm: 1.5,
          material: "STEEL_HIGH_C" as Material,
          complexity: "VERY_COMPLEX" as Complexity,
          colorCode: "RAL 9005",
          colorSystem: "RAL" as const,
          glossLevel: "HIGH_GLOSS" as const,
          template: "wet-2k",
        },
      ],
    },
  ];

  const FROZEN_STATUSES = new Set(["CONFIRMED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "DELIVERED", "INVOICED"]);

  for (const spec of orderSpecs) {
    const cust = customers[spec.customer];
    const itemsWithCalc = spec.items.map((it) => ({
      ...it,
      steps: buildItemSteps({
        templateId: it.template,
        surfaceM2: it.surfaceM2,
        material: it.material,
        complexity: it.complexity,
      }),
    }));
    const total = priceFor({
      items: itemsWithCalc.map((it) => ({ steps: it.steps, quantity: it.quantity })),
      isExpress: spec.priority === "EXPRESS",
      customerDiscountPct: cust.defaultDiscount,
    });

    // Snapshot wenn Status >= CONFIRMED.
    const useSnapshot = FROZEN_STATUSES.has(spec.status);

    // History entries: bei jedem Übergang einen Eintrag erzeugen, damit
    // die Detail-Seite auch realistischen Verlauf zeigt.
    const historyRows: Array<{
      fromStatus: import("@prisma/client").OrderStatus | null;
      toStatus: import("@prisma/client").OrderStatus;
      changedAt: Date;
      comment: string | null;
    }> = [
        { fromStatus: null, toStatus: "DRAFT", changedAt: spec.receivedAt, comment: "Auftrag erfasst" },
      ];
    const s: typeof spec & { confirmedAt?: Date; startedAt?: Date; completedAt?: Date; deliveredAt?: Date; onHoldComment?: string } = spec;
    if (s.confirmedAt) {
      historyRows.push({
        fromStatus: "DRAFT",
        toStatus: "CONFIRMED",
        changedAt: s.confirmedAt,
        comment: "Bestätigt — Snapshot eingefroren",
      });
    }
    if (s.startedAt) {
      historyRows.push({
        fromStatus: "CONFIRMED",
        toStatus: "IN_PROGRESS",
        changedAt: s.startedAt,
        comment: "Werkstatt hat Bearbeitung gestartet",
      });
    }
    if (spec.status === "ON_HOLD" && s.onHoldComment) {
      historyRows.push({
        fromStatus: "IN_PROGRESS",
        toStatus: "ON_HOLD",
        changedAt: daysAgo(3),
        comment: s.onHoldComment,
      });
    }
    if (s.completedAt) {
      historyRows.push({
        fromStatus: "IN_PROGRESS",
        toStatus: "COMPLETED",
        changedAt: s.completedAt,
        comment: "QC bestanden",
      });
    }
    if (s.deliveredAt) {
      historyRows.push({
        fromStatus: "COMPLETED",
        toStatus: "DELIVERED",
        changedAt: s.deliveredAt,
        comment: "An Kunden ausgeliefert",
      });
    }

    await prisma.order.create({
      data: {
        companyId,
        orderNumber: spec.orderNumber,
        customerId: cust.id,
        contactPersonId: cust.contactId,
        shippingAddressId: cust.addressId,
        billingAddressId: cust.addressId,
        status: spec.status,
        priority: spec.priority,
        receivedAt: spec.receivedAt,
        promisedAt: spec.promisedAt,
        startedAt: s.startedAt ?? null,
        completedAt: s.completedAt ?? null,
        deliveredAt: s.deliveredAt ?? null,
        notes: spec.notes ?? null,
        customerNotes: ("customerNotes" in spec ? (spec as { customerNotes?: string }).customerNotes : null) ?? null,
        totalNetCHF: total,
        parameterSnapshot: useSnapshot ? snapshot : undefined,
        createdById: adminUserId,
        items: {
          create: itemsWithCalc.map((it) => ({
            position: it.position,
            description: it.description,
            quantity: it.quantity,
            surfaceM2: it.surfaceM2,
            weightKg: it.weightKg,
            thicknessMm: it.thicknessMm,
            material: it.material,
            complexity: it.complexity,
            colorCode: it.colorCode,
            colorSystem: it.colorSystem,
            glossLevel: it.glossLevel,
            notes: null,
            processSteps: {
              create: it.steps.map((step) => ({
                sequence: step.sequence,
                processCode: step.processCode,
                machineTypeRequired: step.machineTypeRequired,
                skillRequired: step.skillRequired,
                estimatedMinutes: step.estimatedMinutes,
                waitMinutesAfter: step.waitMinutesAfter,
                status: spec.status === "DRAFT" ? "PENDING" : spec.status === "DELIVERED" || spec.status === "COMPLETED" ? "DONE" : "PENDING",
              })),
            },
          })),
        },
        statusHistory: {
          create: historyRows.map((h) => ({
            fromStatus: h.fromStatus,
            toStatus: h.toStatus,
            changedById: adminUserId,
            changedAt: h.changedAt,
            comment: h.comment,
          })),
        },
      },
    });
  }
  console.log(`  ✓ ${orderSpecs.length} Demo-Aufträge erfasst (DRAFT → DELIVERED)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
