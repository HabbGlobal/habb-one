// DTO mappers for Quote-related data.

import type {
  Quote,
  QuoteItem,
  QuoteProcessStep,
  Customer,
  Contact,
} from "@prisma/client";
import { customerDisplayName } from "./customer";

// ─────────────────────────────────────────
// List view
// ─────────────────────────────────────────

export interface QuoteListItemDTO {
  id: string;
  quoteNumber: string;
  status: Quote["status"];
  customerId: string;
  customerDisplayName: string;
  validUntil: Date;
  totalNetCHF: number;
  itemCount: number;
  /** Wenn dieser Quote in einen Auftrag konvertiert wurde — die Order-ID. */
  convertedToOrderId: string | null;
  createdAt: Date;
  /** Wenn validUntil < heute UND Status = SENT → expired. */
  isExpired: boolean;
}

type QuoteForList = Quote & {
  customer: Customer & { contacts?: Contact[] };
  items: { id: string }[];
};

export function toQuoteListItemDTO(q: QuoteForList): QuoteListItemDTO {
  const isExpired = q.status === "SENT" && q.validUntil < new Date();
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    status: q.status,
    customerId: q.customerId,
    customerDisplayName: customerDisplayName(q.customer),
    validUntil: q.validUntil,
    totalNetCHF: Number(q.totalNetCHF),
    itemCount: q.items.length,
    convertedToOrderId: q.convertedToOrderId,
    createdAt: q.createdAt,
    isExpired,
  };
}

// ─────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────

export interface QuoteProcessStepDTO {
  id: string;
  sequence: number;
  processCode: QuoteProcessStep["processCode"];
  machineTypeRequired: QuoteProcessStep["machineTypeRequired"];
  skillRequired: QuoteProcessStep["skillRequired"];
  estimatedMinutes: number;
  waitMinutesAfter: number;
  notes: string | null;
}

export interface QuoteItemDTO {
  id: string;
  position: number;
  description: string;
  quantity: number;
  surfaceM2: number | null;
  weightKg: number | null;
  thicknessMm: number | null;
  material: QuoteItem["material"];
  complexity: QuoteItem["complexity"];
  colorCode: string | null;
  colorSystem: QuoteItem["colorSystem"];
  glossLevel: QuoteItem["glossLevel"];
  applicationArea: QuoteItem["applicationArea"];
  unitPriceCHF: number;
  totalPriceCHF: number;
  notes: string | null;
  templateId: string | null;
  estimatedMinutes: number | null;
  steps: QuoteProcessStepDTO[];
  /** Σ estimatedMinutes × quantity */
  totalEstimatedMinutes: number;
}

export interface QuoteDetailDTO {
  id: string;
  quoteNumber: string;
  status: Quote["status"];
  customerId: string;
  customerDisplayName: string;
  validUntil: Date;
  vatRate: number;
  totalNetCHF: number;
  notes: string | null;
  convertedToOrderId: string | null;
  hasSnapshot: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: QuoteItemDTO[];
}

type QuoteForDetail = Quote & {
  customer: Customer & { contacts?: Contact[] };
  items: (QuoteItem & { processSteps: QuoteProcessStep[] })[];
};

export function toQuoteItemDTO(
  it: QuoteItem & { processSteps: QuoteProcessStep[] },
): QuoteItemDTO {
  const stepsSorted = [...it.processSteps].sort((a, b) => a.sequence - b.sequence);
  const oneRunMinutes = stepsSorted.reduce((s, st) => s + st.estimatedMinutes, 0);
  return {
    id: it.id,
    position: it.position,
    description: it.description,
    quantity: it.quantity,
    surfaceM2: it.surfaceM2 ? Number(it.surfaceM2) : null,
    weightKg: it.weightKg ? Number(it.weightKg) : null,
    thicknessMm: it.thicknessMm ? Number(it.thicknessMm) : null,
    material: it.material,
    complexity: it.complexity,
    colorCode: it.colorCode,
    colorSystem: it.colorSystem,
    glossLevel: it.glossLevel,
    applicationArea: it.applicationArea,
    unitPriceCHF: Number(it.unitPriceCHF),
    totalPriceCHF: Number(it.totalPriceCHF),
    notes: it.notes,
    templateId: it.templateId,
    estimatedMinutes: it.estimatedMinutes,
    steps: stepsSorted.map((st) => ({
      id: st.id,
      sequence: st.sequence,
      processCode: st.processCode,
      machineTypeRequired: st.machineTypeRequired,
      skillRequired: st.skillRequired,
      estimatedMinutes: st.estimatedMinutes,
      waitMinutesAfter: st.waitMinutesAfter,
      notes: st.notes,
    })),
    totalEstimatedMinutes: oneRunMinutes * it.quantity,
  };
}

export function toQuoteDetailDTO(q: QuoteForDetail): QuoteDetailDTO {
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    status: q.status,
    customerId: q.customerId,
    customerDisplayName: customerDisplayName(q.customer),
    validUntil: q.validUntil,
    vatRate: Number(q.vatRate),
    totalNetCHF: Number(q.totalNetCHF),
    notes: q.notes,
    convertedToOrderId: q.convertedToOrderId,
    hasSnapshot: q.parameterSnapshot != null,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    items: [...q.items]
      .sort((a, b) => a.position - b.position)
      .map(toQuoteItemDTO),
  };
}

// ─────────────────────────────────────────
// Status workflow
// ─────────────────────────────────────────

const STATUS_TRANSITIONS: Record<Quote["status"], Quote["status"][]> = {
  DRAFT:    ["SENT", "REJECTED"],
  SENT:     ["ACCEPTED", "REJECTED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED:  ["SENT"],
};

export function allowedNextQuoteStatuses(current: Quote["status"]): Quote["status"][] {
  return STATUS_TRANSITIONS[current] ?? [];
}

export function quoteStatusLabel(s: Quote["status"]): string {
  return {
    DRAFT:    "Entwurf",
    SENT:     "Versendet",
    ACCEPTED: "Angenommen",
    REJECTED: "Abgelehnt",
    EXPIRED:  "Abgelaufen",
  }[s];
}
