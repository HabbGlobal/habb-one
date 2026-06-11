// Bootstrap-Script: legt eine NEUE Firma + ihren ersten Admin-User an.
//
// Verwendung:
//   pnpm tsx scripts/create-company.ts \
//     --name "Beispiel AG" \
//     --admin-email admin@beispiel.ch \
//     --admin-password "ein-sicheres-passwort" \
//     [--admin-name "Max Muster"] \
//     [--address "Industriestrasse 1"] \
//     [--city "Zürich"] \
//     [--country CH] \
//     [--weekly-hours 42] \
//     [--vacation-days 25]
//
// Was angelegt wird:
//   1. Company-Row (mit sinnvollen Schweizer Defaults)
//   2. Admin-User mit bcrypt-Hash + Rolle ADMIN
//   3. 8 Standard-Abwesenheitsarten (Ferien, Krankheit, Unfall, …)
//
// Was NICHT angelegt wird (firmenspezifisch — du legst selbst an):
//   - Mitarbeiter
//   - Werkstatt-Bereiche (WorkArea)
//   - Maschinen
//   - Kunden / Aufträge / Offerten / Rechnungen
//   - System-Parameter (Defaults werden bei Bedarf nachgeladen)
//   - Permission-Matrix-Overrides (Defaults aus dem Code greifen)
//
// Tenant-Isolation: Die neu angelegte Firma sieht KEINE Daten anderer Firmen.
// Beim Login mit der unten ausgegebenen E-Mail wird der User automatisch in
// "sein" Unternehmensportal geleitet — die ganze App filtert auf seine
// `companyId`.

import { PrismaClient, type AbsenceCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

interface Args {
  name: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  address: string | null;
  city: string | null;
  country: string;
  weeklyHours: number;
  vacationDays: number;
}

function parseArgs(argv: string[]): Args {
  const get = (key: string): string | null => {
    const idx = argv.findIndex((a) => a === `--${key}`);
    if (idx < 0 || idx + 1 >= argv.length) return null;
    return argv[idx + 1];
  };

  const required = (key: string): string => {
    const v = get(key);
    if (!v) {
      console.error(`✗ Fehlt: --${key}`);
      console.error("");
      console.error("Beispiel:");
      console.error(
        '  pnpm tsx scripts/create-company.ts --name "Beispiel AG" --admin-email admin@beispiel.ch --admin-password "..."',
      );
      process.exit(1);
    }
    return v;
  };

  const numOr = (key: string, fallback: number): number => {
    const v = get(key);
    if (!v) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      console.error(`✗ --${key} muss eine Zahl sein, war: ${v}`);
      process.exit(1);
    }
    return n;
  };

  const adminEmail = required("admin-email").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    console.error(`✗ --admin-email ist keine gültige E-Mail: ${adminEmail}`);
    process.exit(1);
  }

  const adminPassword = required("admin-password");
  if (adminPassword.length < 8) {
    console.error("✗ --admin-password muss mindestens 8 Zeichen lang sein.");
    process.exit(1);
  }

  return {
    name: required("name").trim(),
    adminEmail,
    adminPassword,
    adminName: get("admin-name")?.trim() || "Admin",
    address: get("address")?.trim() || null,
    city: get("city")?.trim() || null,
    country: (get("country") || "CH").toUpperCase(),
    weeklyHours: numOr("weekly-hours", 42),
    vacationDays: numOr("vacation-days", 25),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`→ Lege neue Firma an: "${args.name}"`);

  // 1) Doppelte Email vermeiden — User.email ist global unique
  const existingUser = await prisma.user.findUnique({
    where: { email: args.adminEmail },
    select: { id: true, companyId: true },
  });
  if (existingUser) {
    console.error(
      `✗ E-Mail "${args.adminEmail}" ist bereits vergeben (gehört zu Firma ${existingUser.companyId}).`,
    );
    process.exit(1);
  }

  // 2) Doppelten Firmennamen warnen (kein Hard-Fail, weil mehrere Filialen
  //    gleich heissen dürfen — IDs sind unique).
  const existingCompany = await prisma.company.findFirst({
    where: { name: args.name },
    select: { id: true },
  });
  if (existingCompany) {
    console.warn(
      `⚠ Eine Firma mit Namen "${args.name}" existiert bereits (id: ${existingCompany.id}). Lege trotzdem eine zweite an.`,
    );
  }

  // 3) Standard-Abwesenheitsarten — gleiche wie im Seed.
  const absenceTypes: Array<{
    key: string;
    labelDe: string;
    labelEn: string;
    category: AbsenceCategory;
    isPaid: boolean;
    reducesTarget: boolean;
    countsAsWorked: boolean;
    requiresApproval: boolean;
    colorHex: string;
  }> = [
    { key: "vacation",      labelDe: "Ferien",                    labelEn: "Vacation",                  category: "VACATION",     isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: true,  colorHex: "#2563eb" },
    { key: "sickness",      labelDe: "Krankheit",                 labelEn: "Sickness",                  category: "SICKNESS",     isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#9333ea" },
    { key: "accident",      labelDe: "Unfall",                    labelEn: "Accident",                  category: "ACCIDENT",     isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#dc2626" },
    { key: "military",      labelDe: "Militär/Zivilschutz",       labelEn: "Military / civil protection", category: "MILITARY",   isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#65a30d" },
    { key: "doctor",        labelDe: "Arzttermin",                labelEn: "Doctor visit",              category: "DOCTOR",       isPaid: true,  reducesTarget: false, countsAsWorked: true,  requiresApproval: false, colorHex: "#059669" },
    { key: "unpaid",        labelDe: "Unbezahlt",                 labelEn: "Unpaid leave",              category: "UNPAID",       isPaid: false, reducesTarget: true,  countsAsWorked: false, requiresApproval: true,  colorHex: "#6b7280" },
    { key: "compensation",  labelDe: "Kompensation/Zeitausgleich", labelEn: "Compensation",            category: "COMPENSATION", isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#0891b2" },
    { key: "other",         labelDe: "Sonstiges",                 labelEn: "Other",                     category: "OTHER",        isPaid: false, reducesTarget: false, countsAsWorked: false, requiresApproval: false, colorHex: "#a3a3a3" },
  ];

  // 4) Atomar erstellen: Company + User + AbsenceTypes in einer Transaktion
  const passwordHash = await bcrypt.hash(args.adminPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: args.name,
        address: args.address,
        city: args.city,
        country: args.country,
        timezone: "Europe/Zurich",
        defaultWeeklyHours: args.weeklyHours,
        defaultVacationDaysYear: args.vacationDays,
        defaultBreakMinutes: 30,
        roundingMinutes: 0,
        maxDailyHours: 10,
        maxWeeklyHours: 50,
        highOvertimeHours: 40,
        defaultLanguage: "de",
        invoicePaymentTerms: 30,
      },
    });

    const user = await tx.user.create({
      data: {
        companyId: company.id,
        email: args.adminEmail,
        name: args.adminName,
        passwordHash,
        role: "ADMIN",
        isActive: true,
        preferredLanguage: "de",
      },
    });

    await tx.absenceType.createMany({
      data: absenceTypes.map((t) => ({ ...t, companyId: company.id })),
    });

    return { company, user };
  });

  console.log("");
  console.log("✓ Firma erstellt");
  console.log(`  ID:           ${result.company.id}`);
  console.log(`  Name:         ${result.company.name}`);
  if (result.company.address) console.log(`  Adresse:      ${result.company.address}`);
  if (result.company.city) console.log(`  Ort:          ${result.company.city}`);
  console.log(`  Wochenstunden: ${result.company.defaultWeeklyHours}h`);
  console.log(`  Ferientage:    ${result.company.defaultVacationDaysYear}/Jahr`);
  console.log("");
  console.log("✓ Admin-User erstellt");
  console.log(`  E-Mail:    ${result.user.email}`);
  console.log(`  Name:      ${result.user.name}`);
  console.log(`  Rolle:     ADMIN (CEO / Geschäftsleitung)`);
  console.log("");
  console.log("✓ 8 Standard-Abwesenheitsarten angelegt");
  console.log("");
  console.log("─────────────────────────────────────────────────────");
  console.log(" LOGIN");
  console.log("─────────────────────────────────────────────────────");
  console.log(`  URL:       https://one.habb.ch/login`);
  console.log(`  E-Mail:    ${args.adminEmail}`);
  console.log(`  Passwort:  ${args.adminPassword}`);
  console.log("");
  console.log("Der User landet beim Login automatisch im Portal seiner");
  console.log("eigenen Firma — sieht KEINE Daten anderer Firmen.");
  console.log("");
  console.log("Nächste Schritte für die neue Firma (nach Login):");
  console.log("  1. /admin/settings  → Firmen-Logo + Banking-Daten");
  console.log("  2. /admin/areas     → Werkstatt-Bereiche definieren");
  console.log("  3. /admin/machines  → Maschinen erfassen");
  console.log("  4. /admin/employees → Mitarbeitende anlegen (mit PIN für Kiosk)");
  console.log("  5. /admin/customers → erste Kunden erfassen");
}

main()
  .catch((e) => {
    console.error("");
    console.error("✗ Fehler:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) {
      console.error(e.stack);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
