// Zod schemas for Quotes.
//
// Quote items behave like Order items: Material/Surface/Complexity +
// explicit ProcessSteps. On convert-to-order the steps are copied 1:1
// into `ProcessStep`.

import { z } from "zod";
import {
  COMPLEXITIES,
  MACHINE_TYPES,
  MATERIALS,
  PROCESS_CODES,
  SKILL_CODES,
} from "./order";

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

// ─────────────────────────────────────────
// Quote-Process-Step (analogous to order.processStepSchema)
// ─────────────────────────────────────────

export const quoteProcessStepSchema = z.object({
  sequence: z.coerce.number().int().min(1).max(9_999),
  processCode: z.enum(PROCESS_CODES),
  machineTypeRequired: z.enum(MACHINE_TYPES).nullable().optional(),
  skillRequired: z.enum(SKILL_CODES),
  estimatedMinutes: z.coerce.number().int().min(0).max(60_000).default(0),
  waitMinutesAfter: z.coerce.number().int().min(0).max(10_000).default(0),
  notes: optionalString,
});
export type QuoteProcessStepFormData = z.infer<typeof quoteProcessStepSchema>;

// ─────────────────────────────────────────
// QuoteItem
// ─────────────────────────────────────────

export const quoteItemSchema = z.object({
  position: z.coerce.number().int().min(1).max(9_999),
  description: z.string().trim().min(1, "Description is required.").max(500),
  quantity: z.coerce.number().int().min(1).max(100_000).default(1),
  surfaceM2: z.coerce.number().min(0.001, "At least 0.001 m²").max(10_000),
  weightKg: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.number().min(0).max(50_000).nullable(),
    )
    .optional(),
  thicknessMm: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.number().min(0).max(500).nullable(),
    )
    .optional(),
  material: z.enum(MATERIALS),
  complexity: z.enum(COMPLEXITIES).default("NORMAL"),
  colorCode: optionalString,
  colorSystem: z.enum(["RAL", "NCS", "PANTONE", "CUSTOM"]).nullable().optional(),
  glossLevel: z.enum(["MATT", "SEMI_GLOSS", "GLOSSY", "HIGH_GLOSS"]).nullable().optional(),
  applicationArea: z.enum(["INDOOR", "OUTDOOR", "BOTH"]).nullable().optional(),
  unitPriceCHF: z.coerce.number().min(0).max(1_000_000),
  notes: optionalString,
  /** ID of a process template — optional, serves as quick-select reference. */
  templateId: z.string().trim().min(1).max(80).nullable().optional()
    .or(z.literal("")).transform((v) => (v === "" ? null : v)),
  /** At least one step — will be copied 1:1 to the order on convert. */
  steps: z.array(quoteProcessStepSchema).min(1, "At least one process step required."),
});
export type QuoteItemFormData = z.infer<typeof quoteItemSchema>;

// ─────────────────────────────────────────
// Quote (Header)
// ─────────────────────────────────────────

export const quoteCoreSchema = z.object({
  customerId: z.string().cuid("Please select a customer."),
  validUntil: z.coerce.date(),
  vatRate: z.coerce.number().min(0).max(30).default(8.1),
  notes: optionalString,
});
export type QuoteCoreFormData = z.infer<typeof quoteCoreSchema>;

export const quoteFullSchema = z.object({
  core: quoteCoreSchema,
  items: z.array(quoteItemSchema).min(1, "At least one item required."),
});
export type QuoteFullFormData = z.infer<typeof quoteFullSchema>;

// ─────────────────────────────────────────
// Status change
// ─────────────────────────────────────────

export const QUOTE_STATUS = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

export const quoteStatusChangeSchema = z.object({
  toStatus: z.enum(QUOTE_STATUS),
  comment: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});
export type QuoteStatusChangeFormData = z.infer<typeof quoteStatusChangeSchema>;

// ─────────────────────────────────────────
// Bulk
// ─────────────────────────────────────────

export const idsSchema = z.array(z.string().cuid()).min(1).max(500);
