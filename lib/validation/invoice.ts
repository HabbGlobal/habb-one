// Zod-Schemas für Rechnungen.

import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

export const invoiceItemSchema = z.object({
  position: z.coerce.number().int().min(1).max(9_999),
  description: z.string().trim().min(1, "Beschreibung Pflicht.").max(500),
  quantity: z.coerce.number().min(0.001, "Menge ≥ 0.001").max(1_000_000).default(1),
  unit: z.string().trim().min(1).max(20).default("Stk"),
  unitPriceCHF: z.coerce.number().min(0).max(1_000_000),
  discountPct: z.coerce.number().min(0).max(100).default(0),
});
export type InvoiceItemFormData = z.infer<typeof invoiceItemSchema>;

export const invoiceCoreSchema = z
  .object({
    customerId: z.string().cuid("Kunde wählen."),
    orderId: z.string().cuid().optional().or(z.literal("")).transform((v) => v || undefined),
    issuedAt: z.coerce.date(),
    dueAt: z.coerce.date(),
    vatRate: z.coerce.number().min(0).max(30).default(8.1),
    notes: optionalString,
  })
  .superRefine((d, ctx) => {
    if (d.dueAt < d.issuedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueAt"],
        message: "Fälligkeit muss nach dem Rechnungsdatum liegen.",
      });
    }
  });
export type InvoiceCoreFormData = z.infer<typeof invoiceCoreSchema>;

export const invoiceFullSchema = z.object({
  core: invoiceCoreSchema,
  items: z.array(invoiceItemSchema).min(1, "Mindestens eine Position."),
});
export type InvoiceFullFormData = z.infer<typeof invoiceFullSchema>;

export const INVOICE_STATUS = ["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"] as const;

export const invoiceStatusChangeSchema = z.object({
  toStatus: z.enum(INVOICE_STATUS),
  comment: optionalString,
});

export const idsSchema = z.array(z.string().cuid()).min(1).max(500);

// Mark-Paid Action: optional Teilbetrag für Teilzahlungen.
export const markPaidSchema = z.object({
  paidAt: z.coerce.date().default(() => new Date()),
  paidAmountCHF: z.coerce.number().min(0).max(10_000_000).optional(),
});

// Settings (Company-Banking)
export const invoiceSettingsSchema = z.object({
  qrIban: z.string().trim().max(34),
  invoiceCreditorName: z.string().trim().max(120).optional().or(z.literal("")).transform((v) => v || undefined),
  vatNumber: z.string().trim().max(40).optional().or(z.literal("")).transform((v) => v || undefined),
  invoicePaymentTerms: z.coerce.number().int().min(0).max(180).default(30),
  invoiceDefaultVatRate: z.coerce.number().min(0).max(30).default(8.1),
});
