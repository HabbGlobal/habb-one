// DTO mappers for Order-related data. Keeps Prisma types out of client
// components and presents only the fields the UI actually needs.

import type {
  Order,
  OrderItem,
  ProcessStep,
  OrderStatusHistory,
  Customer,
  Contact,
  Address,
} from "@prisma/client";
import { customerDisplayName } from "./customer";
import { effectiveBilledMinutes } from "@/lib/order/step-time";

// ─────────────────────────────────────────
// List view
// ─────────────────────────────────────────

export interface OrderListItemDTO {
  id: string;
  orderNumber: string;
  status: Order["status"];
  priority: Order["priority"];
  receivedAt: Date;
  promisedAt: Date;
  internalDeadline: Date | null;
  customerId: string;
  customerDisplayName: string;
  totalNetCHF: number | null;
  itemCount: number;
  totalEstimatedMinutes: number;
  /** Σ actualMinutes × quantity über alle Items, oder null wenn noch unvollständig. */
  totalActualMinutes: number | null;
  /** Σ effectiveBilledMinutes × quantity — was aktuell verrechnet würde. */
  totalBilledMinutes: number;
  archivedAt: Date | null;
  deletedAt: Date | null;
  /** True when promisedAt < now and not yet COMPLETED/DELIVERED. */
  isLate: boolean;
}

type OrderForList = Order & {
  customer: Customer & { contacts?: Contact[] };
  items: (OrderItem & {
    processSteps: Pick<
      ProcessStep,
      | "estimatedMinutes"
      | "actualMinutes"
      | "billedMinutes"
      | "billingTimeSource"
    >[];
  })[];
};

export function toOrderListItemDTO(o: OrderForList): OrderListItemDTO {
  let totalEstimated = 0;
  let totalBilled = 0;
  let allStepsDone = true;
  let totalActual = 0;
  for (const it of o.items) {
    let runEstimated = 0;
    let runBilled = 0;
    let runActual = 0;
    for (const st of it.processSteps) {
      runEstimated += st.estimatedMinutes;
      runBilled += effectiveBilledMinutes({
        estimatedMinutes: st.estimatedMinutes,
        actualMinutes: st.actualMinutes,
        billedMinutes: st.billedMinutes,
        billingTimeSource: st.billingTimeSource,
      });
      if (st.actualMinutes == null) allStepsDone = false;
      else runActual += st.actualMinutes;
    }
    totalEstimated += runEstimated * it.quantity;
    totalBilled += runBilled * it.quantity;
    totalActual += runActual * it.quantity;
  }

  const now = new Date();
  const finalStatuses: Order["status"][] = ["COMPLETED", "DELIVERED", "INVOICED", "CANCELLED"];
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    priority: o.priority,
    receivedAt: o.receivedAt,
    promisedAt: o.promisedAt,
    internalDeadline: o.internalDeadline,
    customerId: o.customerId,
    customerDisplayName: customerDisplayName(o.customer),
    totalNetCHF: o.totalNetCHF ? Number(o.totalNetCHF) : null,
    itemCount: o.items.length,
    totalEstimatedMinutes: totalEstimated,
    totalActualMinutes: allStepsDone ? totalActual : null,
    totalBilledMinutes: totalBilled,
    archivedAt: o.archivedAt,
    deletedAt: o.deletedAt,
    isLate: o.promisedAt < now && !finalStatuses.includes(o.status),
  };
}

// ─────────────────────────────────────────
// Detail view
// ─────────────────────────────────────────

export interface ProcessStepDTO {
  id: string;
  sequence: number;
  processCode: ProcessStep["processCode"];
  machineTypeRequired: ProcessStep["machineTypeRequired"];
  skillRequired: ProcessStep["skillRequired"];
  estimatedMinutes: number;
  actualMinutes: number | null;
  /** Manueller Override-Wert (CEO) — nur relevant wenn billingTimeSource = MANUAL. */
  billedMinutes: number | null;
  /** Welche Zeit verrechnet wird: ACTUAL (Default) | ESTIMATED | MANUAL. */
  billingTimeSource: ProcessStep["billingTimeSource"];
  /** Effektiv verrechnete Minuten — bereits aufgelöst nach billingTimeSource. */
  effectiveBilledMinutes: number;
  waitMinutesAfter: number;
  status: ProcessStep["status"];
  notes: string | null;
}

export interface OrderItemDTO {
  id: string;
  position: number;
  description: string;
  quantity: number;
  surfaceM2: number;
  weightKg: number | null;
  thicknessMm: number | null;
  material: OrderItem["material"];
  complexity: OrderItem["complexity"];
  colorCode: string | null;
  colorSystem: OrderItem["colorSystem"];
  glossLevel: OrderItem["glossLevel"];
  applicationArea: OrderItem["applicationArea"];
  unitPriceCHF: number | null;
  notes: string | null;
  processSteps: ProcessStepDTO[];
  /** Computed sum of all step minutes × quantity. */
  totalEstimatedMinutes: number;
  /** Σ actualMinutes × quantity, oder null wenn noch kein Schritt finalisiert. */
  totalActualMinutes: number | null;
  /** Σ effectiveBilledMinutes × quantity — was der Auftrag aktuell ausweist. */
  totalBilledMinutes: number;
}

export interface OrderStatusHistoryDTO {
  id: string;
  fromStatus: OrderStatusHistory["fromStatus"];
  toStatus: OrderStatusHistory["toStatus"];
  changedAt: Date;
  changedByName: string;
  comment: string | null;
}

export interface OrderDetailDTO {
  id: string;
  orderNumber: string;
  status: Order["status"];
  priority: Order["priority"];
  receivedAt: Date;
  promisedAt: Date;
  internalDeadline: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  deliveredAt: Date | null;
  notes: string | null;
  customerNotes: string | null;
  trackingId: string;
  /** Öffentliches Tracking-Token (UUID v4) — für /track-URL + Etikett. */
  trackingToken: string;
  totalNetCHF: number | null;
  /** Whether parameterSnapshot has been frozen. */
  hasSnapshot: boolean;
  customerInitiated: boolean;
  archivedAt: Date | null;
  deletedAt: Date | null;
  customerId: string;
  customerDisplayName: string;
  contactPersonId: string | null;
  contactPersonName: string | null;
  shippingAddressId: string | null;
  billingAddressId: string | null;
  items: OrderItemDTO[];
  history: OrderStatusHistoryDTO[];
}

type OrderForDetail = Order & {
  customer: Customer & { contacts?: Contact[] };
  contactPerson?: Contact | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  items: (OrderItem & { processSteps: ProcessStep[] })[];
  statusHistory?: OrderStatusHistory[];
};

/**
 * Lookup map for user-id → display-name. The OrderStatusHistory model
 * stores `changedById` but no Prisma relation, so callers fetch users
 * separately and pass the resolved map here.
 */
export type UserNameMap = Map<string, string>;

export function toOrderItemDTO(it: OrderItem & { processSteps: ProcessStep[] }): OrderItemDTO {
  const stepsSorted = [...it.processSteps].sort((a, b) => a.sequence - b.sequence);
  const oneRunEstimated = stepsSorted.reduce((s, st) => s + st.estimatedMinutes, 0);
  const oneRunActual = stepsSorted.every((st) => st.actualMinutes != null)
    ? stepsSorted.reduce((s, st) => s + (st.actualMinutes ?? 0), 0)
    : null;

  const stepsDto: ProcessStepDTO[] = stepsSorted.map((st) => {
    const effective = effectiveBilledMinutes({
      estimatedMinutes: st.estimatedMinutes,
      actualMinutes: st.actualMinutes,
      billedMinutes: st.billedMinutes,
      billingTimeSource: st.billingTimeSource,
    });
    return {
      id: st.id,
      sequence: st.sequence,
      processCode: st.processCode,
      machineTypeRequired: st.machineTypeRequired,
      skillRequired: st.skillRequired,
      estimatedMinutes: st.estimatedMinutes,
      actualMinutes: st.actualMinutes,
      billedMinutes: st.billedMinutes,
      billingTimeSource: st.billingTimeSource,
      effectiveBilledMinutes: effective,
      waitMinutesAfter: st.waitMinutesAfter,
      status: st.status,
      notes: st.notes,
    };
  });
  const oneRunBilled = stepsDto.reduce((s, st) => s + st.effectiveBilledMinutes, 0);

  return {
    id: it.id,
    position: it.position,
    description: it.description,
    quantity: it.quantity,
    surfaceM2: Number(it.surfaceM2),
    weightKg: it.weightKg ? Number(it.weightKg) : null,
    thicknessMm: it.thicknessMm ? Number(it.thicknessMm) : null,
    material: it.material,
    complexity: it.complexity,
    colorCode: it.colorCode,
    colorSystem: it.colorSystem,
    glossLevel: it.glossLevel,
    applicationArea: it.applicationArea,
    unitPriceCHF: it.unitPriceCHF ? Number(it.unitPriceCHF) : null,
    notes: it.notes,
    processSteps: stepsDto,
    totalEstimatedMinutes: oneRunEstimated * it.quantity,
    totalActualMinutes: oneRunActual != null ? oneRunActual * it.quantity : null,
    totalBilledMinutes: oneRunBilled * it.quantity,
  };
}

export function toOrderDetailDTO(
  o: OrderForDetail,
  userNames: UserNameMap = new Map(),
): OrderDetailDTO {
  const items = [...o.items]
    .sort((a, b) => a.position - b.position)
    .map(toOrderItemDTO);

  const contactName = o.contactPerson
    ? `${o.contactPerson.firstName} ${o.contactPerson.lastName}`
    : null;

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    priority: o.priority,
    receivedAt: o.receivedAt,
    promisedAt: o.promisedAt,
    internalDeadline: o.internalDeadline,
    startedAt: o.startedAt,
    completedAt: o.completedAt,
    deliveredAt: o.deliveredAt,
    notes: o.notes,
    customerNotes: o.customerNotes,
    trackingId: o.trackingId,
    trackingToken: o.trackingToken,
    totalNetCHF: o.totalNetCHF ? Number(o.totalNetCHF) : null,
    hasSnapshot: o.parameterSnapshot != null,
    customerInitiated: o.customerInitiated,
    archivedAt: o.archivedAt,
    deletedAt: o.deletedAt,
    customerId: o.customerId,
    customerDisplayName: customerDisplayName(o.customer),
    contactPersonId: o.contactPersonId,
    contactPersonName: contactName,
    shippingAddressId: o.shippingAddressId,
    billingAddressId: o.billingAddressId,
    items,
    history: (o.statusHistory ?? []).map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedAt: h.changedAt,
      changedByName: userNames.get(h.changedById) ?? "—",
      comment: h.comment,
    })),
  };
}

// ─────────────────────────────────────────
// Status workflow helpers
// ─────────────────────────────────────────

const STATUS_TRANSITIONS: Record<Order["status"], Order["status"][]> = {
  DRAFT:       ["CONFIRMED", "CANCELLED"],
  CONFIRMED:   ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD:     ["IN_PROGRESS", "CANCELLED"],
  COMPLETED:   ["DELIVERED", "INVOICED"],
  DELIVERED:   ["INVOICED"],
  INVOICED:    [],
  CANCELLED:   [],
};

/** Returns the legal next-states for a given current status. */
export function allowedNextStatuses(current: Order["status"]): Order["status"][] {
  return STATUS_TRANSITIONS[current] ?? [];
}

export function statusLabel(s: Order["status"]): string {
  return {
    DRAFT: "Entwurf",
    CONFIRMED: "Bestätigt",
    IN_PROGRESS: "In Arbeit",
    ON_HOLD: "Pausiert",
    COMPLETED: "Abgeschlossen",
    DELIVERED: "Geliefert",
    CANCELLED: "Storniert",
    INVOICED: "Verrechnet",
  }[s];
}

export function priorityLabel(p: Order["priority"]): string {
  return {
    LOW: "Niedrig",
    NORMAL: "Normal",
    HIGH: "Hoch",
    EXPRESS: "Express",
  }[p];
}
