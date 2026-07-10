import { z } from "zod";

// `nullableNumber` accepts null/undefined as-is, otherwise coerces to number.
// Avoids Zod's coerce-then-validate trap where null → Number(null) = 0 silently
// turns "no value" into a real zero (which would, for hourly-wage employees,
// overwrite the intentional null workloadPercent with 0).
const nullableNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
    z.number().min(min).max(max).nullable()
  );

const requiredNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(min).max(max)
  );

/** NIC check: accepts 8-12 alphanumeric characters. */
const NIC_REGEX = /^[A-Za-z0-9]{8,12}$/;
/** Swiss AHV-Nr. check: accepts 756.XXXX.XXXX.XX. */
const AHV_REGEX = /^7[0-9]{2}[.]?[0-9]{4}[.]?[0-9]{4}[.]?[0-9]{2}$/;

export const SKILL_CODES = [
  "PREP",
  "BLASTER",
  "PAINTER",
  "POWDER_COATER",
  "QC",
  "TEAM_LEAD_SKILL",
] as const;
export type SkillCodeValue = (typeof SKILL_CODES)[number];

export const SKILL_LEVELS = ["BASIC", "EXPERIENCED", "EXPERT"] as const;
export type SkillLevelValue = (typeof SKILL_LEVELS)[number];

export const employeeFormSchema = z.object({
  employeeNumber: z.string().min(1).max(20),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  preferredLanguage: z.enum(["de", "en"]).default("de"),
  isActive: z.boolean().default(true),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  endDate: z.string().optional().or(z.literal("")),
  // ── Employee master data (PR 6) ─────────────────────────────────
  dateOfBirth: z.string().optional().or(z.literal("")),
  address: z.string().max(200).optional().or(z.literal("")),
  ahvNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || NIC_REGEX.test(v) || AHV_REGEX.test(v),
      "Must be a valid Sri Lankan NIC (8-12 alphanumeric characters) or Swiss AHV-Nr. (756.XXXX.XXXX.XX)",
    ),
  // ── Employment ────────────────────────────────────────────────
  employmentType: z.enum(["MONTHLY_SALARY", "HOURLY_WAGE"]),
  workloadPercent: nullableNumber(0, 100),
  weeklyTargetHours: nullableNumber(0, 80),
  defaultBreakMinutes: requiredNumber(0, 180),
  annualVacationDays: requiredNumber(0, 60),
  initialOvertimeHours: requiredNumber(-1000, 1000),
  initialVacationDays: requiredNumber(-100, 100),
  notes: z.string().optional().or(z.literal("")),
  scheduleDays: z
    .object({
      MON: requiredNumber(0, 24),
      TUE: requiredNumber(0, 24),
      WED: requiredNumber(0, 24),
      THU: requiredNumber(0, 24),
      FRI: requiredNumber(0, 24),
      SAT: requiredNumber(0, 24),
      SUN: requiredNumber(0, 24),
    })
    .optional(),
  workAreaIds: z.array(z.string().cuid()).default([]),
  /// Skills — Skill code + Level + optional cert date.
  skills: z
    .array(
      z.object({
        skillCode: z.enum(SKILL_CODES),
        level: z.enum(SKILL_LEVELS),
        certifiedUntil: z.string().optional().or(z.literal("")),
      }),
    )
    .default([]),
});

export type EmployeeFormData = z.infer<typeof employeeFormSchema>;

export const SKILL_LABELS_DE: Record<SkillCodeValue, string> = {
  PREP: "Preparation",
  BLASTER: "Sandblasting",
  PAINTER: "Wet Painting",
  POWDER_COATER: "Powder Coating",
  QC: "Quality Control",
  TEAM_LEAD_SKILL: "Team Lead",
};

export const SKILL_LEVEL_LABELS_DE: Record<SkillLevelValue, string> = {
  BASIC: "Basic",
  EXPERIENCED: "Experienced",
  EXPERT: "Expert",
};
