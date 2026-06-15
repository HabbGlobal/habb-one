// DTO mappers for Invoice-related data.

import type {
  Invoice,
  InvoiceItem,
  Customer,
  Contact,
} from "@prisma/client";
import { customerDisplayName } from "./customer";

// ─────────────────────────────────────────
// List view
// ─────────────────────────────────────────

export interface InvoiceListItemDTO {
  id: string;
  invoiceNumber: string;
  status: Invoice["status"];
  customerId: string;
  customerDisplayName: string;
  issuedAt: Date;
  dueAt: Date;
  totalNetCHF: number;
  totalGrossCHF: number;
  paidAmountCHF: number | null;
  paidAt: Date | null;
  reminderLevel: number;
  isOverdue: boolean;
  orderId: string | null;
  qrBillReference: string | null;
}

type InvoiceForList = Invoice & {
  customer: Customer & { contacts?: Contact[] };
};

export function toInvoiceListItemDTO(i: InvoiceForList): InvoiceListItemDTO {
  const now = new Date();
  const isOverdue =
    (i.status === "SENT" || i.status === "OVERDUE") && i.dueAt < now;
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    status: i.status,
    customerId: i.customerId,
    customerDisplayName: customerDisplayName(i.customer),
    issuedAt: i.issuedAt,
    dueAt: i.dueAt,
    totalNetCHF: Number(i.totalNetCHF),
    totalGrossCHF: Number(i.totalGrossCHF),
    paidAmountCHF: i.paidAmountCHF ? Number(i.paidAmountCHF) : null,
    paidAt: i.paidAt,
    reminderLevel: i.reminderLevel,
    isOverdue,
    orderId: i.orderId,
    qrBillReference: i.qrBillReference,
  };
}

// ─────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────

export interface InvoiceItemDTO {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCHF: number;
  discountPct: number;
  totalCHF: number;
}

export interface InvoiceBillingAddressSnapshot {
  name: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  vatNumber?: string;
}

export interface InvoiceDetailDTO {
  id: string;
  invoiceNumber: string;
  status: Invoice["status"];
  customerId: string;
  customerDisplayName: string;
  orderId: string | null;
  issuedAt: Date;
  dueAt: Date;
  sentAt: Date | null;
  paidAt: Date | null;
  paidAmountCHF: number | null;
  reminderLevel: number;
  lastReminderAt: Date | null;
  totalNetCHF: number;
  vatRate: number;
  vatCHF: number;
  totalGrossCHF: number;
  qrBillReference: string | null;
  notes: string | null;
  billingAddressSnapshot: InvoiceBillingAddressSnapshot | null;
  isOverdue: boolean;
  archivedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItemDTO[];
}

type InvoiceForDetail = Invoice & {
  customer: Customer & { contacts?: Contact[] };
  items: InvoiceItem[];
};

export function toInvoiceItemDTO(it: InvoiceItem): InvoiceItemDTO {
  return {
    id: it.id,
    position: it.position,
    description: it.description,
    quantity: Number(it.quantity),
    unit: it.unit,
    unitPriceCHF: Number(it.unitPriceCHF),
    discountPct: Number(it.discountPct),
    totalCHF: Number(it.totalCHF),
  };
}

export function toInvoiceDetailDTO(i: InvoiceForDetail): InvoiceDetailDTO {
  const isOverdue =
    (i.status === "SENT" || i.status === "OVERDUE") && i.dueAt < new Date();
  return {
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    status: i.status,
    customerId: i.customerId,
    customerDisplayName: customerDisplayName(i.customer),
    orderId: i.orderId,
    issuedAt: i.issuedAt,
    dueAt: i.dueAt,
    sentAt: i.sentAt,
    paidAt: i.paidAt,
    paidAmountCHF: i.paidAmountCHF ? Number(i.paidAmountCHF) : null,
    reminderLevel: i.reminderLevel,
    lastReminderAt: i.lastReminderAt,
    totalNetCHF: Number(i.totalNetCHF),
    vatRate: Number(i.vatRate),
    vatCHF: Number(i.vatCHF),
    totalGrossCHF: Number(i.totalGrossCHF),
    qrBillReference: i.qrBillReference,
    notes: i.notes,
    billingAddressSnapshot: i.billingAddressSnapshot as InvoiceBillingAddressSnapshot | null,
    isOverdue,
    archivedAt: i.archivedAt,
    deletedAt: i.deletedAt,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    items: [...i.items].sort((a, b) => a.position - b.position).map(toInvoiceItemDTO),
  };
}

// ─────────────────────────────────────────
// Status workflow
// ─────────────────────────────────────────

const STATUS_TRANSITIONS: Record<Invoice["status"], Invoice["status"][]> = {
  DRAFT:     ["SENT", "CANCELLED"],
  SENT:      ["PAID", "OVERDUE", "CANCELLED"],
  OVERDUE:   ["PAID", "CANCELLED"],
  PAID:      [],
  CANCELLED: [],
};

export function allowedNextInvoiceStatuses(s: Invoice["status"]): Invoice["status"][] {
  return STATUS_TRANSITIONS[s] ?? [];
}

export function invoiceStatusLabel(s: Invoice["status"]): string {
  return {
    DRAFT:     "Draft",
    SENT:      "Sent",
    PAID:      "Paid",
    OVERDUE:   "Overdue",
    CANCELLED: "Cancelled",
  }[s];
}
