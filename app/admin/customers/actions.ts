"use server";

// Customer + Address + Contact server actions. All mutations:
//   1. require permission via `lib/permissions.ts`,
//   2. validate input via Zod (errors mapped to German messages),
//   3. run inside a Prisma transaction when multiple rows change,
//   4. write an `AuditLog` entry.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  addressSchema,
  contactSchema,
  customerCoreSchema,
  idsSchema,
} from "@/lib/validation/customer";
import { generateCustomerNumber } from "@/lib/customer/numbering";
import {
  findDuplicateCustomers,
  type DuplicateMatch,
} from "@/lib/customer/duplicates";

// ─────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────

async function requireWriter() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "customers.write")) {
    throw new Error("Keine Berechtigung.");
  }
  return session.user;
}

async function requireReader() {
  const session = await auth();
  if (!session?.user) throw new Error("Nicht angemeldet.");
  if (!hasPermission(session.user.role, "customers.read")) {
    throw new Error("Keine Berechtigung.");
  }
  return session.user;
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue.path.join(".");
    throw new Error(path ? `${path}: ${issue.message}` : issue.message);
  }
  return r.data;
}

function explainPrismaError(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "Feld";
      if (target.includes("customerNumber")) {
        return "Diese Kundennummer existiert bereits — bitte erneut versuchen.";
      }
      if (target.includes("vatNumber")) {
        return "Diese MwSt-Nummer ist bereits einem anderen Kunden zugeordnet.";
      }
      return `Eindeutigkeits-Konflikt: ${target}`;
    }
    if (err.code === "P2025") return "Datensatz nicht gefunden.";
  }
  return null;
}

// ─────────────────────────────────────────
// Read: duplicate check (UI calls this before submit)
// ─────────────────────────────────────────

export async function checkDuplicates(input: {
  vatNumber?: string;
  companyName?: string;
  zip?: string;
  primaryEmail?: string;
  excludeId?: string;
}): Promise<DuplicateMatch[]> {
  const user = await requireReader();
  return findDuplicateCustomers(prisma, {
    companyId: user.companyId,
    ...input,
  });
}

// ─────────────────────────────────────────
// Customer Create / Update
// ─────────────────────────────────────────

const createInputSchema = z.object({
  core: customerCoreSchema,
  /** Optional: at least one address can be created in the same form. */
  initialAddress: addressSchema.optional(),
  /** Optional: at least one contact (always a sensible idea for B2B). */
  initialContact: contactSchema.optional(),
});

export async function createCustomer(input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(createInputSchema, input);

  let customerId = "";
  try {
    customerId = await prisma.$transaction(async (tx) => {
      const year = new Date().getFullYear();
      const customerNumber = await generateCustomerNumber(tx, user.companyId, year);

      const created = await tx.customer.create({
        data: {
          companyId: user.companyId,
          customerNumber,
          type: data.core.type,
          companyName: data.core.companyName ?? null,
          vatNumber: data.core.vatNumber ?? null,
          language: data.core.language,
          paymentTerms: data.core.paymentTerms,
          defaultDiscount: data.core.defaultDiscount ?? null,
          creditLimit: data.core.creditLimit ?? null,
          notes: data.core.notes ?? null,
          isActive: data.core.isActive,
          addresses: data.initialAddress
            ? { create: [{ ...data.initialAddress, isDefault: true }] }
            : undefined,
          contacts: data.initialContact
            ? {
                create: [
                  { ...data.initialContact, isPrimary: data.initialContact.isPrimary },
                ],
              }
            : undefined,
        },
      });
      return created.id;
    });
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Customer",
    entityId: customerId,
    newValue: {
      type: data.core.type,
      companyName: data.core.companyName,
    },
  });

  revalidatePath("/admin/customers");
  return { id: customerId };
}

export async function updateCustomer(id: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(customerCoreSchema, input);

  const before = await prisma.customer.findUniqueOrThrow({ where: { id } });
  if (before.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  try {
    await prisma.customer.update({
      where: { id },
      data: {
        type: data.type,
        companyName: data.companyName ?? null,
        vatNumber: data.vatNumber ?? null,
        language: data.language,
        paymentTerms: data.paymentTerms,
        defaultDiscount: data.defaultDiscount ?? null,
        creditLimit: data.creditLimit ?? null,
        notes: data.notes ?? null,
        isActive: data.isActive,
      },
    });
  } catch (err) {
    const friendly = explainPrismaError(err);
    if (friendly) throw new Error(friendly);
    throw err;
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Customer",
    entityId: id,
    oldValue: {
      type: before.type,
      companyName: before.companyName,
      isActive: before.isActive,
    },
    newValue: {
      type: data.type,
      companyName: data.companyName,
      isActive: data.isActive,
    },
  });

  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
}

// ─────────────────────────────────────────
// Address management (sub-resource)
// ─────────────────────────────────────────

export async function addAddress(customerId: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(addressSchema, input);

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
  });
  if (customer.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      // Only one default address per customer per type — un-flag any sibling.
      await tx.address.updateMany({
        where: {
          customerId,
          isDefault: true,
          OR:
            data.type === "BOTH"
              ? undefined
              : [{ type: data.type }, { type: "BOTH" }],
        },
        data: { isDefault: false },
      });
    }
    await tx.address.create({ data: { customerId, ...data } });
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Address",
    entityId: customerId,
    newValue: { city: data.city, type: data.type },
  });
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function updateAddress(addressId: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(addressSchema, input);

  const before = await prisma.address.findUniqueOrThrow({
    where: { id: addressId },
    include: { customer: true },
  });
  if (before.customer.companyId !== user.companyId) {
    throw new Error("Keine Berechtigung.");
  }

  await prisma.$transaction(async (tx) => {
    if (data.isDefault && !before.isDefault) {
      await tx.address.updateMany({
        where: {
          customerId: before.customerId,
          isDefault: true,
          NOT: { id: addressId },
          OR:
            data.type === "BOTH"
              ? undefined
              : [{ type: data.type }, { type: "BOTH" }],
        },
        data: { isDefault: false },
      });
    }
    await tx.address.update({ where: { id: addressId }, data });
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Address",
    entityId: addressId,
    newValue: { city: data.city, type: data.type, isDefault: data.isDefault },
  });
  revalidatePath(`/admin/customers/${before.customerId}`);
}

export async function deleteAddress(addressId: string) {
  const user = await requireWriter();
  const before = await prisma.address.findUniqueOrThrow({
    where: { id: addressId },
    include: { customer: true },
  });
  if (before.customer.companyId !== user.companyId) {
    throw new Error("Keine Berechtigung.");
  }
  await prisma.address.delete({ where: { id: addressId } });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "DELETE",
    entityType: "Address",
    entityId: addressId,
  });
  revalidatePath(`/admin/customers/${before.customerId}`);
}

// ─────────────────────────────────────────
// Contact management
// ─────────────────────────────────────────

export async function addContact(customerId: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(contactSchema, input);

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
  });
  if (customer.companyId !== user.companyId) throw new Error("Keine Berechtigung.");

  await prisma.$transaction(async (tx) => {
    if (data.isPrimary) {
      await tx.contact.updateMany({
        where: { customerId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    await tx.contact.create({ data: { customerId, ...data } });
  });

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "CREATE",
    entityType: "Contact",
    entityId: customerId,
    newValue: { firstName: data.firstName, lastName: data.lastName },
  });
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function updateContact(contactId: string, input: unknown) {
  const user = await requireWriter();
  const data = parseOrThrow(contactSchema, input);
  const before = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: { customer: true },
  });
  if (before.customer.companyId !== user.companyId) {
    throw new Error("Keine Berechtigung.");
  }
  await prisma.$transaction(async (tx) => {
    if (data.isPrimary && !before.isPrimary) {
      await tx.contact.updateMany({
        where: { customerId: before.customerId, isPrimary: true, NOT: { id: contactId } },
        data: { isPrimary: false },
      });
    }
    await tx.contact.update({ where: { id: contactId }, data });
  });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Contact",
    entityId: contactId,
  });
  revalidatePath(`/admin/customers/${before.customerId}`);
}

export async function deleteContact(contactId: string) {
  const user = await requireWriter();
  const before = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: { customer: true },
  });
  if (before.customer.companyId !== user.companyId) {
    throw new Error("Keine Berechtigung.");
  }
  await prisma.contact.delete({ where: { id: contactId } });
  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    action: "DELETE",
    entityType: "Contact",
    entityId: contactId,
  });
  revalidatePath(`/admin/customers/${before.customerId}`);
}

// ─────────────────────────────────────────
// Bulk lifecycle (mirrors employees/areas/holidays pattern)
// ─────────────────────────────────────────

async function authorizeBulk(ids: string[]) {
  const user = await requireWriter();
  const owned = await prisma.customer.findMany({
    where: { id: { in: ids }, companyId: user.companyId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw new Error("Mindestens ein Eintrag gehört nicht zu dieser Firma.");
  }
  return user;
}

export async function bulkArchiveCustomers(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.customer.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: new Date(), isActive: false },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "Customer", entityId: id,
      reason: "Bulk archive",
    });
  }
  revalidatePath("/admin/customers");
}

export async function bulkDeleteCustomers(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.customer.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { deletedAt: new Date(), isActive: false },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "Customer", entityId: id,
      reason: "Bulk soft-delete (revDSG)",
    });
  }
  revalidatePath("/admin/customers");
}

export async function bulkRestoreCustomers(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  await prisma.customer.updateMany({
    where: { id: { in: ids }, companyId: user.companyId },
    data: { archivedAt: null, deletedAt: null, isActive: true },
  });
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "UPDATE", entityType: "Customer", entityId: id,
      reason: "Bulk restore",
    });
  }
  revalidatePath("/admin/customers");
}

export async function bulkHardDeleteCustomers(rawIds: unknown) {
  const ids = parseOrThrow(idsSchema, rawIds);
  const user = await authorizeBulk(ids);
  for (const id of ids) {
    await recordAudit({
      companyId: user.companyId, userId: user.id,
      action: "DELETE", entityType: "Customer", entityId: id,
      reason: "Bulk hard delete",
    });
  }
  await prisma.customer.deleteMany({
    where: { id: { in: ids }, companyId: user.companyId },
  });
  revalidatePath("/admin/customers");
}
