/**
 * Public Pricing Definition.
 *
 * Single Source of Truth for the Pricing page AND Owner Billing display.
 * Modify values here, the app adapts automatically (MRR estimation, plan cards,
 * module visibility later).
 *
 * Prices INCLUDE VAT (8.1 % CH standard, as of Jan 2024). If you want to show
 * them excl. VAT -> `displayInclusiveVat = false`.
 */

import type { TenantModule } from "@prisma/client";

export const PRICING_VAT_RATE = 8.1;

export interface ModuleSpec {
  key: TenantModule;
  label: string;
  description: string;
  longDescription: string;
}

export const MODULES: Record<TenantModule, ModuleSpec> = {
  CRM: {
    key: "CRM",
    label: "CRM — Customers",
    description: "Master data, contacts, addresses, multilingual",
    longDescription: "Manage private and business customers with addresses, contact persons, payment terms, and VAT numbers. Includes duplicate check upon creation.",
  },
  ORDERS_QUOTES: {
    key: "ORDERS_QUOTES",
    label: "Orders + Quotes",
    description: "Process templates, snapshot on send, PDF export",
    longDescription: "Create quotes and orders with customizable process templates (sandblasting, powder coating, wet paint...). Parameter snapshot freezes the price upon sending.",
  },
  INVOICES_QR: {
    key: "INVOICES_QR",
    label: "Invoices + QR-Bill",
    description: "QR-IBAN payment part directly in PDF, status tracking",
    longDescription: "Invoices with embedded QR payment part as A4 PDF. SENT -> OVERDUE status updates run automatically.",
  },
  WORKSHOP_PLAN: {
    key: "WORKSHOP_PLAN",
    label: "Workshop Plan",
    description: "Gantt overview, auto-scheduling, skill matching",
    longDescription: "Visual workshop plan with automatic scheduling based on deadlines, skill match, and machine availability. Built-in conflict detection.",
  },
  STAFF_PLAN: {
    key: "STAFF_PLAN",
    label: "Staff Plan + Payroll",
    description: "Shifts, hour balances, monthly payroll evaluation",
    longDescription: "Staff schedule with area assignment. Monthly payroll evaluation with Excel and PDF export including balances, absences, and holiday entitlement.",
  },
  TIME_KIOSK: {
    key: "TIME_KIOSK",
    label: "Time Clock (Tablet)",
    description: "The central time clock for HABB One: PIN login, real-time balance, breaks, holiday status — directly for payroll",
    longDescription: "One of the core features of HABB One. A single tablet (or any browser) becomes the workshop time clock: employees clock in and out with their personal 4-digit PIN — no individual login, no app installation per person. Records arrivals, departures, and breaks with automatic break rules. Everyone instantly sees their own daily and weekly balance, target/actual hours, and current holiday status. All entries are cleanly assigned to the right company (multi-tenant) and flow directly into the staff plan and monthly payroll without manual entry.",
  },
  API_ACCESS: {
    key: "API_ACCESS",
    label: "API Access",
    description: "Bexio, Abacus, AbaNinja, and Webhook integrations",
    longDescription: "REST API with token auth. Two-way synchronization with Bexio, Abacus, and AbaNinja for customers + invoices. Webhooks for order status changes.",
  },
  WHITELABEL: {
    key: "WHITELABEL",
    label: "Whitelabel",
    description: "Custom subdomain, custom logo, custom PDF templates",
    longDescription: "Brand the app in your colors. Custom subdomain (e.g., erp.yourcompany.com) instead of one.HABB Global (PVT) LTD. Custom PDF templates for quotes/invoices.",
  },
};

export type PlanKey = "TRIAL" | "TIME_ONLY" | "STARTER" | "PRO" | "ENTERPRISE";

export interface PlanSpec {
  key: PlanKey;
  label: string;
  priceUSD: number | null;
  priceNote?: string;
  tagline: string;
  highlights: string[];
  modules: TenantModule[];
  limits: { label: string; value: string }[];
  featured?: boolean;
}

export function priceForMRR(plan: PlanSpec): number {
  return plan.priceUSD ?? 0;
}

const ALL_MODULES = Object.keys(MODULES) as TenantModule[];

export const PLANS: PlanSpec[] = [
  {
    key: "TRIAL",
    label: "Trial",
    priceUSD: 0,
    priceNote: "14 days free · no credit card required",
    tagline: "Full functionality to test — without risk.",
    highlights: [
      "All modules active",
      "14 days free, then auto-upgrade to Starter",
      "1 Tenant · up to 3 employees",
      "Secure Hosting",
    ],
    modules: ALL_MODULES,
    limits: [
      { label: "Employees", value: "up to 3" },
      { label: "Invoices / Month", value: "up to 20" },
      { label: "Support", value: "Email" },
    ],
  },
  {
    key: "TIME_ONLY",
    label: "Time Tracking",
    priceUSD: 29,
    tagline: "Just time tracking — the time clock without the rest of the ERP.",
    highlights: [
      "Time clock (Tablet/PIN) for the whole workshop",
      "Live attendance + manual time correction",
      "Breaks, Home Office, Target/Actual balance, holiday status",
      "Absences, public holidays + monthly payroll export (PDF/Excel)",
      "Up to 10 employees with time clock",
    ],
    modules: ["TIME_KIOSK"],
    limits: [
      { label: "Employees", value: "up to 10" },
      { label: "Payroll Export", value: "PDF + Excel" },
      { label: "Support", value: "Email" },
    ],
  },
  {
    key: "STARTER",
    label: "Starter",
    priceUSD: 49,
    tagline: "For small businesses with their own billing.",
    highlights: [
      "CRM + Orders + Quotes + Invoices",
      "QR-Bill in PDF",
      "Time clock + Staff plan included",
      "Owner support via consent impersonation",
      "Up to 6 employees with time clock",
    ],
    modules: ["CRM", "ORDERS_QUOTES", "INVOICES_QR", "TIME_KIOSK", "STAFF_PLAN"],
    limits: [
      { label: "Employees", value: "up to 6" },
      { label: "Invoices / Month", value: "up to 100" },
      { label: "Support", value: "E-Mail + Owner Impersonation" },
    ],
  },
  {
    key: "PRO",
    label: "Pro",
    priceUSD: 89,
    tagline: "Workshop with auto-scheduling and payroll.",
    highlights: [
      "Everything in Starter",
      "Workshop plan with auto-scheduling",
      "Staff plan + monthly payroll",
      "Owner support via consent impersonation",
      "Up to 25 employees",
    ],
    modules: [
      "CRM",
      "ORDERS_QUOTES",
      "INVOICES_QR",
      "TIME_KIOSK",
      "WORKSHOP_PLAN",
      "STAFF_PLAN",
    ],
    limits: [
      { label: "Employees", value: "up to 25" },
      { label: "Invoices / Month", value: "up to 500" },
      { label: "Support", value: "E-Mail + Phone + Owner Impersonation" },
    ],
    featured: true,
  },
  {
    key: "ENTERPRISE",
    label: "Enterprise",
    priceUSD: null,
    priceNote: "Custom contracts — upon request",
    tagline: "Full suite with integrations and SLA.",
    highlights: [
      "Everything in Pro",
      "API Access (Bexio · Abacus · AbaNinja · Webhooks)",
      "Whitelabel (custom subdomain + branding)",
      "Unlimited employees",
      "SLA + dedicated support",
    ],
    modules: ALL_MODULES,
    limits: [
      { label: "Employees", value: "unlimited" },
      { label: "Invoices / Month", value: "unlimited" },
      { label: "Support", value: "Prioritized, with SLA" },
    ],
  },
];

export const PLAN_KEYS = PLANS.map((p) => p.key) as [PlanKey, ...PlanKey[]];

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
