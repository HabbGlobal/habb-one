// Zod-Schemas für Process-Vorlagen.

import { z } from "zod";
import { MACHINE_TYPES, PROCESS_CODES, SKILL_CODES } from "./order";

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const templateStepSchema = z.object({
  sequence: z.coerce.number().int().min(1).max(9_999),
  processCode: z.enum(PROCESS_CODES),
  machineTypeRequired: z.enum(MACHINE_TYPES).nullable().optional(),
  skillRequired: z.enum(SKILL_CODES),
  defaultWaitMinutes: z.coerce.number().int().min(0).max(10_000).default(0),
  notes: optionalString,
});
export type TemplateStepFormData = z.infer<typeof templateStepSchema>;

export const templateFullSchema = z.object({
  label: z.string().trim().min(1, "Bezeichnung ist Pflicht.").max(120),
  description: optionalString,
  sortOrder: z.coerce.number().int().min(0).max(9_999).default(0),
  steps: z.array(templateStepSchema).min(1, "Mindestens ein Schritt."),
});
export type TemplateFullFormData = z.infer<typeof templateFullSchema>;

export const idsSchema = z.array(z.string().cuid()).min(1).max(500);
