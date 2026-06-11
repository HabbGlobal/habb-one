// Zod schemas for the Customer CRM.
//
// Single source of truth for shape + types — `z.infer<…>` is used wherever
// TypeScript types of customer data are needed (forms, server actions, DTOs).

import { z } from "zod";

// ─────────────────────────────────────────
// Atomic field validators
// ─────────────────────────────────────────

/** CHE-VAT in the form CHE-123.456.789 (MWST|TVA|IVA). */
export const swissVatNumber = z
  .string()
  .regex(
    /^CHE-\d{3}\.\d{3}\.\d{3}( (MWST|TVA|IVA))?$/,
    "Ungültiges CH-Format. Beispiel: CHE-123.456.789 MWST",
  );

/** Country-aware ZIP validator: CH/AT 4-digit, DE 5-digit, others 3–10 chars. */
export function zipForCountry(country: string): z.ZodString {
  if (country === "CH" || country === "AT") {
    return z.string().regex(/^\d{4}$/, "PLZ muss 4-stellig sein.");
  }
  if (country === "DE") {
    return z.string().regex(/^\d{5}$/, "PLZ muss 5-stellig sein.");
  }
  return z.string().min(3).max(10);
}

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const optionalEmail = z
  .string()
  .email("Ungültige E-Mail-Adresse.")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

const optionalSwissVat = swissVatNumber
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? undefined : v));

// ─────────────────────────────────────────
// Customer (Stammdaten)
// ─────────────────────────────────────────

export const customerCoreSchema = z
  .object({
    type: z.enum(["PRIVATE", "BUSINESS"]),
    companyName: optionalString,
    vatNumber: optionalSwissVat,
    language: z.enum(["DE", "FR", "IT", "EN"]).default("DE"),
    paymentTerms: z.coerce.number().int().min(0).max(180).default(30),
    defaultDiscount: z
      .preprocess(
        (v) => (v === "" || v == null ? null : Number(v)),
        z.number().min(0).max(100).nullable(),
      )
      .optional(),
    creditLimit: z
      .preprocess(
        (v) => (v === "" || v == null ? null : Number(v)),
        z.number().min(0).max(10_000_000).nullable(),
      )
      .optional(),
    notes: optionalString,
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // Business customers must provide a company name.
    if (data.type === "BUSINESS" && !data.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "Firmenname ist bei Geschäftskunden Pflicht.",
      });
    }
  });

export type CustomerCoreFormData = z.infer<typeof customerCoreSchema>;

// ─────────────────────────────────────────
// Address
// ─────────────────────────────────────────

export const addressSchema = z
  .object({
    type: z.enum(["BILLING", "SHIPPING", "BOTH"]).default("BOTH"),
    street: z.string().trim().min(1, "Strasse ist Pflicht.").max(200),
    zip: z.string().trim().min(3).max(10),
    city: z.string().trim().min(1, "Ort ist Pflicht.").max(120),
    canton: optionalString,
    country: z.string().trim().length(2, "Länder­code 2-stellig (z. B. CH, DE).").default("CH"),
    isDefault: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    // ZIP validation depends on country — re-run with the appropriate rule.
    const r = zipForCountry(d.country.toUpperCase()).safeParse(d.zip);
    if (!r.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["zip"],
        message: r.error.issues[0]?.message ?? "Ungültige PLZ.",
      });
    }
  });

export type AddressFormData = z.infer<typeof addressSchema>;

// ─────────────────────────────────────────
// Contact
// ─────────────────────────────────────────

export const contactSchema = z.object({
  salutation: optionalString,
  firstName: z.string().trim().min(1, "Vorname ist Pflicht.").max(80),
  lastName: z.string().trim().min(1, "Nachname ist Pflicht.").max(80),
  position: optionalString,
  email: optionalEmail,
  phone: optionalString,
  mobile: optionalString,
  isPrimary: z.boolean().default(false),
});

export type ContactFormData = z.infer<typeof contactSchema>;

// ─────────────────────────────────────────
// Bulk operations (lifecycle)
// ─────────────────────────────────────────

export const idsSchema = z.array(z.string().cuid()).min(1).max(500);
