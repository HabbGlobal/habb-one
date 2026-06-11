/**
 * One-Shot-Import der Tschannen-Mitarbeitenden aus
 * "Liste Mitarbeiter Zeiterfassung KI.ods".
 *
 * Run:  node_modules/.bin/tsx scripts/import-tschannen-employees.ts
 *
 * Idempotent: löscht vorab alle Tschannen-Employees mit einer der
 * Ziel-Mitarbeiter-Nummern (cascade auf Zeitbuchungen) und legt die
 * komplette Liste sauber neu an. Jede Person bekommt einen zufälligen
 * 4-stelligen PIN; die Zuordnung Name → Nr. → PIN wird am Ende
 * ausgegeben, damit sie verteilt werden kann.
 *
 * Header der Liste: "Arbeitsstunden pro Woche 42.5 bei 100%" →
 * weeklyTargetHours = 42.5 * Pensum/100 (nur Monatslohn).
 */

import { PrismaClient, type EmploymentType } from "@prisma/client";
import { hashPin, generatePin } from "../lib/pin";

const prisma = new PrismaClient();

const WEEKLY_AT_100 = 42.5;

interface Row {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  dateOfBirth: string | null; // ISO yyyy-mm-dd
  address: string;
  employmentType: EmploymentType;
  workloadPercent: number | null;
  annualVacationDays: number;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string | null;
  notes: string;
}

// weeklyTargetHours für Monatslohn aus Pensum ableiten; Stundenlohn = null.
function weekly(type: EmploymentType, pensum: number | null): number | null {
  if (type !== "MONTHLY_SALARY" || pensum == null) return null;
  return Math.round(WEEKLY_AT_100 * (pensum / 100) * 100) / 100;
}

const ROWS: Row[] = [
  {
    employeeNumber: "117",
    firstName: "Mohammad",
    lastName: "Khawari",
    email: "mohamadkhavari115@gmail.com",
    dateOfBirth: "2004-01-01",
    address: "Bernstrasse 20, 3312 Fraubrunnen",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 70,
    annualVacationDays: 20,
    startDate: "2026-04-13",
    endDate: "2026-07-31",
    notes:
      "Arbeitsbereich: Praktikum, Vorarbeiten/Nacharbeiten | Arbeitstage: Mo-Fr Morgens + Mo/Fr Nachmittag | Vertrag: befristet | Bemerkung: Aussicht Lehrvertrag ab 01.08.26",
  },
  {
    employeeNumber: "115",
    firstName: "Thivyan",
    lastName: "Ganeshwaran",
    email: "thivyan39@gmail.com",
    dateOfBirth: "2004-02-18",
    address: "Hessstrasse 5, 3097 Liebefeld",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 50,
    annualVacationDays: 20,
    startDate: "2026-03-16",
    endDate: "2026-07-31",
    notes:
      "Arbeitsbereich: Praktikum, Vorarbeiten/Nacharbeiten | Arbeitstage: Mo-Fr Morgens | Vertrag: befristet | Bemerkung: Aussicht Lehrvertrag ab 01.08.26",
  },
  {
    employeeNumber: "107",
    firstName: "Erion",
    lastName: "Hodja",
    email: "erionhohja13@icloud.ch",
    dateOfBirth: "2006-11-26",
    address: "Jurastrasse 1, 3422 Alchenflüh",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 100,
    annualVacationDays: 25,
    startDate: "2023-08-01",
    endDate: "2026-07-31",
    notes:
      "Arbeitsbereich: Lehre Industrielackierer EFZ (alles ausser Strahlen) | Vertrag: befristet | Bemerkung: Lehrende 31.07.26",
  },
  {
    employeeNumber: "104",
    firstName: "Miriam",
    lastName: "Bienz",
    email: "miriam_leu@yahoo.de",
    dateOfBirth: "1983-08-09",
    address: "Pfeilstrasse 13, 4552 Derendingen",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 60,
    annualVacationDays: 20,
    startDate: "2021-01-11",
    endDate: null,
    notes:
      "Arbeitsbereich: Büro / Administration, Stv. Geschäftsführer | Arbeitstage: Mo-Fr Morgens + Mi Nachmittag | Vertrag: unbefristet",
  },
  {
    employeeNumber: "105",
    firstName: "Suyarajh",
    lastName: "Kanagaratnam",
    email: "rajh2007@gmail.com",
    dateOfBirth: "1976-07-19",
    address: "Hofackerstr. 6, 8545 Rickecnbach ZH",
    employmentType: "HOURLY_WAGE",
    workloadPercent: null,
    annualVacationDays: 0,
    startDate: "2018-11-01",
    endDate: null,
    notes:
      "Arbeitsbereich: Vor-/Nacharbeiten, Pulvern, Sandstrahlen | Vertrag: Stundenlohn | Bemerkung: Stempelname von Tarsan",
  },
  {
    employeeNumber: "106",
    firstName: "Harashini",
    lastName: "Gregory",
    email: null,
    dateOfBirth: null,
    address: "Hofackerstr. 6, 8545 Rickecnbach ZH",
    employmentType: "HOURLY_WAGE",
    workloadPercent: null,
    annualVacationDays: 0,
    startDate: "2018-11-01",
    endDate: null,
    notes:
      "Arbeitsbereich: Vor-/Nacharbeiten, Pulvern, Sandstrahlen | Vertrag: Stundenlohn | Bemerkung: Stempelname von Francis | Hinweis: Eintrittsdatum nicht in Liste — angenommen 01.11.2018, bitte prüfen",
  },
  {
    employeeNumber: "102",
    firstName: "Balakirishanth",
    lastName: "Balavinakakamoorty",
    email: "bala.sangeeth93@gmail.com",
    dateOfBirth: "1993-06-28",
    address: "Hauptstrasse 21B, 3422 Alchenflüh",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 100,
    annualVacationDays: 20,
    startDate: "2023-10-01",
    endDate: null,
    notes:
      "Arbeitsbereich: Transport, Vor-/Nacharbeiten, Pulvern, Nasslack | Arbeitstage: Mo-Fr | Vertrag: unbefristet",
  },
  {
    employeeNumber: "108",
    firstName: "Davor",
    lastName: "Jovanovic",
    email: "dav.jov07@gmail.com",
    dateOfBirth: "2007-06-20",
    address: "Jurastrasse 17, 3422 Alchenflüh",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 100,
    annualVacationDays: 25,
    startDate: "2024-08-19",
    endDate: "2027-08-18",
    notes:
      "Arbeitsbereich: Lehre Industrielackierer EFZ (alles ausser Strahlen) | Arbeitstage: Mo-Fr | Vertrag: befristet | Bemerkung: Lehrende 18.08.27",
  },
  {
    employeeNumber: "116",
    firstName: "Lala",
    lastName: "Ahmed",
    email: "lalakurdi313@gmail.com",
    dateOfBirth: "2005-07-26",
    address: "Utzenstorfstr. 8, 3425 Koppigen",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 100,
    annualVacationDays: 20,
    startDate: "2026-03-18",
    endDate: null,
    notes:
      "Arbeitsbereich: Vor-/Nacharbeiten, Pulvern | Arbeitstage: Mo-Fr | Vertrag: unbefristet",
  },
  {
    employeeNumber: "103",
    firstName: "Daniel",
    lastName: "Bienz",
    email: "daniel.bienz@gmx.ch",
    dateOfBirth: "1960-06-13",
    address: "Grabenstrasse 34a, 2557 Studen",
    employmentType: "HOURLY_WAGE",
    workloadPercent: null,
    annualVacationDays: 0,
    startDate: "2024-09-12",
    endDate: null,
    notes:
      "Arbeitsbereich: Transporte | Arbeitstage: Do/Fr | Vertrag: Stundenlohn, unbefristet",
  },
  {
    employeeNumber: "110",
    firstName: "Okan",
    lastName: "Soylu",
    email: "okansoylu2462@gmail.com",
    dateOfBirth: "1988-09-01",
    address: "Tägetlistr., 3072 Ostermundigen",
    employmentType: "MONTHLY_SALARY",
    workloadPercent: 80,
    annualVacationDays: 20,
    startDate: "2024-10-01",
    endDate: null,
    notes:
      "Arbeitsbereich: Vor-/Nacharbeiten, Sandstrahlen | Vertrag: unbefristet",
  },
];

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "Tschannen", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Tschannen-Mandant nicht gefunden.");
  console.log(`Mandant: ${company.name} (${company.id})`);

  const targetNumbers = ROWS.map((r) => r.employeeNumber);

  // Idempotenz: bestehende Datensätze mit Ziel-Nummern hart löschen
  // (cascade auf TimeEntry/Punch/Break/ScheduleEntry via Schema).
  const del = await prisma.employee.deleteMany({
    where: { companyId: company.id, employeeNumber: { in: targetNumbers } },
  });
  if (del.count > 0) console.log(`Gelöscht (Re-Import): ${del.count} Datensätze`);

  const credentials: { nr: string; name: string; pin: string }[] = [];

  for (const r of ROWS) {
    const pin = generatePin();
    const pinHash = await hashPin(pin);
    await prisma.employee.create({
      data: {
        companyId: company.id,
        employeeNumber: r.employeeNumber,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        preferredLanguage: "de",
        isActive: true,
        startDate: new Date(r.startDate),
        endDate: r.endDate ? new Date(r.endDate) : null,
        dateOfBirth: r.dateOfBirth ? new Date(r.dateOfBirth) : null,
        address: r.address,
        ahvNumber: null,
        employmentType: r.employmentType,
        workloadPercent: r.workloadPercent,
        weeklyTargetHours: weekly(r.employmentType, r.workloadPercent),
        defaultBreakMinutes: 30,
        annualVacationDays: r.annualVacationDays,
        initialOvertimeHours: 0,
        initialVacationDays: 0,
        notes: r.notes,
        pinHash,
      },
    });
    credentials.push({
      nr: r.employeeNumber,
      name: `${r.firstName} ${r.lastName}`,
      pin,
    });
  }

  console.log(`\nAngelegt: ${credentials.length} Mitarbeitende\n`);
  console.log("PIN-Liste (vertraulich verteilen, danach nicht mehr abrufbar):");
  console.log("Nr.  | Name                          | PIN");
  console.log("-----+-------------------------------+-----");
  for (const c of credentials.sort((a, b) => a.nr.localeCompare(b.nr))) {
    console.log(`${c.nr.padEnd(4)} | ${c.name.padEnd(29)} | ${c.pin}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
