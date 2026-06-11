// Zod schemas for the Order/OrderItem/ProcessStep aggregate.
//
// Single source of truth for shape + types — `z.infer<…>` is used wherever
// TypeScript types of order data are needed (forms, server actions, DTOs).
// Keep all enums in lockstep with `prisma/schema.prisma`.

import { z } from "zod";

// ─────────────────────────────────────────
// Enums (mirror Prisma — keep names identical)
// ─────────────────────────────────────────

export const PROCESS_CODES = [
  "DISASSEMBLY", "DEGREASE_MANUAL", "CHEM_PRETREAT", "MASKING", "MOUNTING",
  "BLAST_SA1", "BLAST_SA2", "BLAST_SA25", "BLAST_SA3", "BLAST_GLASS",
  "WP_PRIMER", "WP_SANDING", "WP_TOP_1K", "WP_TOP_2K", "WP_CLEAR",
  "PC_APPLICATION", "PC_CURING", "PC_DOUBLE",
  "UNMASKING", "QUALITY_CHECK", "TOUCHUP", "PACKAGING",
] as const;

export const MACHINE_TYPES = [
  "BLAST_CABIN", "CHEM_BATH", "PAINT_CABIN", "POWDER_CABIN",
  "CURING_OVEN", "DRYING_OVEN",
] as const;

export const SKILL_CODES = [
  "PREP", "BLASTER", "PAINTER", "POWDER_COATER", "QC", "TEAM_LEAD_SKILL",
] as const;

export const MATERIALS = [
  "STEEL_S235", "STEEL_HIGH_C", "STAINLESS", "ALUMINIUM",
  "GALVANIZED", "CAST_IRON", "OTHER",
] as const;

export const COMPLEXITIES = ["SIMPLE", "NORMAL", "COMPLEX", "VERY_COMPLEX"] as const;

export const APPLICATION_AREAS = ["INDOOR", "OUTDOOR", "BOTH"] as const;

export const ORDER_STATUS = [
  "DRAFT", "CONFIRMED", "IN_PROGRESS", "ON_HOLD",
  "COMPLETED", "DELIVERED", "CANCELLED", "INVOICED",
] as const;

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "EXPRESS"] as const;

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

// ─────────────────────────────────────────
// ProcessStep
// ─────────────────────────────────────────

export const processStepSchema = z.object({
  /** Position in the workflow — 10/20/30 increments by convention. */
  sequence: z.coerce.number().int().min(1).max(9_999),
  processCode: z.enum(PROCESS_CODES),
  /** Resource hint — the auto-scheduler pins the step to a machine of this type. */
  machineTypeRequired: z.enum(MACHINE_TYPES).nullable().optional(),
  skillRequired: z.enum(SKILL_CODES),
  /** Filled by the calc engine; clients still send a value (zero is fine). */
  estimatedMinutes: z.coerce.number().int().min(0).max(60_000).default(0),
  /** Drying / curing wait that blocks successors but no resource. */
  waitMinutesAfter: z.coerce.number().int().min(0).max(10_000).default(0),
  notes: optionalString,
});

export type ProcessStepFormData = z.infer<typeof processStepSchema>;

// ─────────────────────────────────────────
// OrderItem
// ─────────────────────────────────────────

export const orderItemSchema = z.object({
  position: z.coerce.number().int().min(1).max(9_999),
  description: z.string().trim().min(1, "Beschreibung ist Pflicht.").max(500),
  quantity: z.coerce.number().int().min(1).max(100_000).default(1),
  surfaceM2: z.coerce.number().min(0.001, "Mindestens 0.001 m².").max(10_000),
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
  applicationArea: z.enum(APPLICATION_AREAS).nullable().optional(),
  unitPriceCHF: z
    .preprocess(
      (v) => (v === "" || v == null ? null : Number(v)),
      z.number().min(0).max(1_000_000).nullable(),
    )
    .optional(),
  notes: optionalString,
  steps: z.array(processStepSchema).min(1, "Mindestens ein Prozessschritt."),
});

export type OrderItemFormData = z.infer<typeof orderItemSchema>;

// ─────────────────────────────────────────
// Order (top-level)
// ─────────────────────────────────────────

export const orderCoreSchema = z
  .object({
    customerId: z.string().cuid("Kunde wählen."),
    contactPersonId: z.string().cuid().optional().or(z.literal("")).transform((v) => v || undefined),
    shippingAddressId: z.string().cuid().optional().or(z.literal("")).transform((v) => v || undefined),
    billingAddressId: z.string().cuid().optional().or(z.literal("")).transform((v) => v || undefined),
    priority: z.enum(PRIORITIES).default("NORMAL"),
    receivedAt: z.coerce.date(),
    promisedAt: z.coerce.date(),
    internalDeadline: z.preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.coerce.date().nullable(),
    ).optional(),
    notes: optionalString,
    customerNotes: optionalString,
  })
  .superRefine((data, ctx) => {
    if (data.promisedAt < data.receivedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promisedAt"],
        message: "Liefertermin darf nicht vor Eingangsdatum liegen.",
      });
    }
    if (data.internalDeadline && data.internalDeadline > data.promisedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["internalDeadline"],
        message: "Interne Deadline muss vor dem Liefertermin liegen.",
      });
    }
  });

export type OrderCoreFormData = z.infer<typeof orderCoreSchema>;

/** Full payload for create / update including children. */
export const orderFullSchema = z.object({
  core: orderCoreSchema,
  items: z.array(orderItemSchema).min(1, "Mindestens eine Position."),
});

export type OrderFullFormData = z.infer<typeof orderFullSchema>;

// ─────────────────────────────────────────
// Status transition (with optional comment)
// ─────────────────────────────────────────

export const orderStatusChangeSchema = z.object({
  toStatus: z.enum(ORDER_STATUS),
  comment: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v)),
});

export type OrderStatusChangeFormData = z.infer<typeof orderStatusChangeSchema>;

// ─────────────────────────────────────────
// Bulk lifecycle
// ─────────────────────────────────────────

export const idsSchema = z.array(z.string().cuid()).min(1).max(500);
