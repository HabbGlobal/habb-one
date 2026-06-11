// DTO mappers for Customer-related data. Keeps Prisma types out of
// client components (briefing rule 1.2.6).

import type {
  Address,
  Contact,
  Customer,
  Locale,
  Order,
} from "@prisma/client";

export interface CustomerListItemDTO {
  id: string;
  customerNumber: string;
  type: Customer["type"];
  language: Locale;
  /** Already-resolved display name (companyName or "FirstName LastName"). */
  displayName: string;
  primaryContactName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  /** City of the default billing address (or first address). */
  city: string | null;
  isActive: boolean;
  archivedAt: Date | null;
  deletedAt: Date | null;
  /** Aggregated counts for the list table. */
  openOrdersCount: number;
  totalOrdersCount: number;
}

export interface CustomerDetailDTO {
  id: string;
  customerNumber: string;
  type: Customer["type"];
  companyName: string | null;
  vatNumber: string | null;
  language: Locale;
  paymentTerms: number;
  defaultDiscount: number | null;
  creditLimit: number | null;
  notes: string | null;
  isActive: boolean;
  archivedAt: Date | null;
  deletedAt: Date | null;
  bexioContactId: string | null;
  abacusCustomerId: string | null;
  portalEnabled: boolean;
  portalSlug: string | null;
  createdAt: Date;
  updatedAt: Date;
  addresses: AddressDTO[];
  contacts: ContactDTO[];
  displayName: string;
}

export interface AddressDTO {
  id: string;
  type: Address["type"];
  street: string;
  zip: string;
  city: string;
  canton: string | null;
  country: string;
  isDefault: boolean;
}

export interface ContactDTO {
  id: string;
  salutation: string | null;
  firstName: string;
  lastName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isPrimary: boolean;
  hasPortalAccess: boolean;
}

// ─────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────

type CustomerWithRelations = Customer & {
  contacts?: Contact[];
  addresses?: Address[];
  orders?: Pick<Order, "id" | "status">[];
};

/** Resolves the "display name" used everywhere a single string is needed
 *  to identify a customer (lists, breadcrumbs, dropdowns). */
export function customerDisplayName(c: CustomerWithRelations): string {
  if (c.companyName) return c.companyName;
  const primary =
    c.contacts?.find((x) => x.isPrimary) ?? c.contacts?.[0] ?? null;
  if (primary) return `${primary.firstName} ${primary.lastName}`;
  return `Kunde ${c.customerNumber}`;
}

export function toAddressDTO(a: Address): AddressDTO {
  return {
    id: a.id,
    type: a.type,
    street: a.street,
    zip: a.zip,
    city: a.city,
    canton: a.canton,
    country: a.country,
    isDefault: a.isDefault,
  };
}

export function toContactDTO(c: Contact): ContactDTO {
  return {
    id: c.id,
    salutation: c.salutation,
    firstName: c.firstName,
    lastName: c.lastName,
    position: c.position,
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    isPrimary: c.isPrimary,
    hasPortalAccess: c.hasPortalAccess,
  };
}

export function toCustomerListItemDTO(
  c: CustomerWithRelations & { _count?: { orders: number } },
): CustomerListItemDTO {
  const primary = c.contacts?.find((x) => x.isPrimary) ?? c.contacts?.[0] ?? null;
  const billing =
    c.addresses?.find((a) => a.type === "BILLING" && a.isDefault) ??
    c.addresses?.find((a) => a.isDefault) ??
    c.addresses?.[0] ??
    null;
  const openOrdersCount =
    c.orders?.filter((o) =>
      ["DRAFT", "CONFIRMED", "IN_PROGRESS", "ON_HOLD"].includes(o.status),
    ).length ?? 0;
  return {
    id: c.id,
    customerNumber: c.customerNumber,
    type: c.type,
    language: c.language,
    displayName: customerDisplayName(c),
    primaryContactName: primary
      ? `${primary.firstName} ${primary.lastName}`
      : null,
    primaryEmail: primary?.email ?? null,
    primaryPhone: primary?.phone ?? null,
    city: billing?.city ?? null,
    isActive: c.isActive,
    archivedAt: c.archivedAt,
    deletedAt: c.deletedAt,
    openOrdersCount,
    totalOrdersCount: c._count?.orders ?? c.orders?.length ?? 0,
  };
}

export function toCustomerDetailDTO(c: CustomerWithRelations): CustomerDetailDTO {
  return {
    id: c.id,
    customerNumber: c.customerNumber,
    type: c.type,
    companyName: c.companyName,
    vatNumber: c.vatNumber,
    language: c.language,
    paymentTerms: c.paymentTerms,
    defaultDiscount: c.defaultDiscount ? Number(c.defaultDiscount) : null,
    creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
    notes: c.notes,
    isActive: c.isActive,
    archivedAt: c.archivedAt,
    deletedAt: c.deletedAt,
    bexioContactId: c.bexioContactId,
    abacusCustomerId: c.abacusCustomerId,
    portalEnabled: c.portalEnabled,
    portalSlug: c.portalSlug,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    addresses: (c.addresses ?? []).map(toAddressDTO),
    contacts: (c.contacts ?? []).map(toContactDTO),
    displayName: customerDisplayName(c),
  };
}
