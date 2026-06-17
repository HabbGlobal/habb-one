/**
 * Bootstrap helper for new tenants. Used by two callers:
 *   - POST /api/auth/register       (Public Self-Registration)
 *   - POST /api/owner/tenants       (owner manual create)
 *
 * Responsibilities:
 *   - atomically create Company + Admin User + default absence types
 *   - no data carry-over from other tenants; every insert is fresh
 *   - SUPERADMIN role for the initial admin; the only sanctioned way to create
 *     a SUPERADMIN
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Prisma, TenantRegistrationStatus, AbsenceCategory, TenantPlan } from "@prisma/client";
import { buildSwissHolidayRows } from "@/lib/holidays/ch-defaults";
import { PARAMETER_SEEDS } from "@/lib/domain/parameters/seeds";

interface CompanyInput {
  name: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  country: string;
  defaultLanguage?: string;
  /** Selected subscription package. If missing, the Prisma default (STARTER)
   *  applies. For self-registration this is only the *requested* plan; it takes
   *  effect only after owner approval. PENDING tenants use no modules. */
  plan?: TenantPlan;
}

interface AdminInput {
  email: string;
  name: string;
  passwordHash: string;
  preferredLanguage?: string;
  /** For owner manual create: emailVerifiedAt = now. For self-registration: null. */
  emailAlreadyVerified: boolean;
  /** For owner temp password: mustChangePassword=true. Default false. */
  mustChangePassword?: boolean;
}

interface BootstrapInput {
  company: CompanyInput;
  admin: AdminInput;
  status: TenantRegistrationStatus;
}

interface BootstrapResult {
  companyId: string;
  userId: string;
}

const DEFAULT_ABSENCE_TYPES: Array<{
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
  { key: "vacation",     labelDe: "Ferien",                     labelEn: "Vacation",                    category: "VACATION",     isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: true,  colorHex: "#2563eb" },
  { key: "sickness",     labelDe: "Krankheit",                  labelEn: "Sickness",                    category: "SICKNESS",     isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#9333ea" },
  { key: "accident",     labelDe: "Unfall",                     labelEn: "Accident",                    category: "ACCIDENT",     isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#dc2626" },
  { key: "military",     labelDe: "Militär/Zivilschutz",        labelEn: "Military / civil protection", category: "MILITARY",     isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#65a30d" },
  { key: "doctor",       labelDe: "Arzttermin",                 labelEn: "Doctor visit",                category: "DOCTOR",       isPaid: true,  reducesTarget: false, countsAsWorked: true,  requiresApproval: false, colorHex: "#059669" },
  { key: "unpaid",       labelDe: "Unbezahlt",                  labelEn: "Unpaid leave",                category: "UNPAID",       isPaid: false, reducesTarget: true,  countsAsWorked: false, requiresApproval: true,  colorHex: "#6b7280" },
  { key: "compensation", labelDe: "Kompensation/Zeitausgleich", labelEn: "Compensation",                category: "COMPENSATION", isPaid: true,  reducesTarget: true,  countsAsWorked: false, requiresApproval: false, colorHex: "#0891b2" },
  { key: "other",        labelDe: "Sonstiges",                  labelEn: "Other",                       category: "OTHER",        isPaid: false, reducesTarget: false, countsAsWorked: false, requiresApproval: false, colorHex: "#a3a3a3" },
];

export async function bootstrapNewTenant(input: BootstrapInput): Promise<BootstrapResult> {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const companyData: Prisma.CompanyCreateInput = {
      name: input.company.name,
      phone: input.company.phone,
      address: input.company.address ?? null,
      city: input.company.city ?? null,
      country: input.company.country,
      timezone: "Europe/Zurich",
      defaultLanguage: input.company.defaultLanguage ?? "de",
      // undefined => Prisma default (STARTER). Keeps existing behavior
      // unchanged for registrations without a plan.
      plan: input.company.plan,
      registrationStatus: input.status,
      registrationSubmittedAt: input.status === "ACTIVE" ? null : now,
      registrationEmailVerifiedAt:
        input.admin.emailAlreadyVerified || input.status === "ACTIVE" ? now : null,
      registrationApprovedAt: input.status === "ACTIVE" ? now : null,
    };

    const company = await tx.company.create({ data: companyData });

    const user = await tx.user.create({
      data: {
        companyId: company.id,
        email: input.admin.email,
        name: input.admin.name,
        passwordHash: input.admin.passwordHash,
        role: "SUPERADMIN",
        isActive: true,
        preferredLanguage: input.admin.preferredLanguage ?? "de",
        emailVerifiedAt: input.admin.emailAlreadyVerified ? now : null,
        mustChangePassword: input.admin.mustChangePassword ?? false,
      },
    });

    await tx.absenceType.createMany({
      data: DEFAULT_ABSENCE_TYPES.map((t) => ({ ...t, companyId: company.id })),
    });

    // CH base holidays for the current and next year. Without Holiday rows,
    // the scheduler does not plan breaks and payroll counts holidays
    // incorrectly, so this initial set is required.
    const currentYear = now.getUTCFullYear();
    await tx.holiday.createMany({
      data: buildSwissHolidayRows(company.id, [currentYear, currentYear + 1]),
      skipDuplicates: true,
    });

    // System parameters from seed defaults; each tenant gets its own copy so
    // hourly rates/process times can be calibrated independently. Without
    // these rows the calculation engine fails on the first quote save with
    // "SystemParameter not found".
    await tx.systemParameter.createMany({
      data: PARAMETER_SEEDS.map((seed) => ({
        companyId: company.id,
        key: seed.key,
        category: seed.category,
        subCategory: seed.subCategory ?? null,
        label: seed.label,
        description: seed.description ?? null,
        valueType: seed.valueType,
        currentValue: String(seed.defaultValue),
        defaultValue: String(seed.defaultValue),
        unit: seed.unit ?? null,
        minValue: seed.minValue ?? null,
        maxValue: seed.maxValue ?? null,
        step: seed.step ?? null,
        affectsFormula: seed.affectsFormula ?? null,
        updatedById: user.id,
      })),
      skipDuplicates: true,
    });

    return { companyId: company.id, userId: user.id };
  });

  return result;
}

/**
 * Constant bcrypt comparison against an always-present dummy hash. Useful for
 * preventing account enumeration through timing when an endpoint starts with a
 * user lookup.
 */
export const DUMMY_BCRYPT_HASH =
  "$2a$12$DUMMYDUMMYDUMMYDUMMYDU.fakefakefakefakefakefakefakefakefakefaa";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
