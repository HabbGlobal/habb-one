// Soft duplicate detection for customer creation. Returns potential matches
// as a warning — does NOT block creation (sometimes intentional, e.g. two
// branches of the same group).

import type { PrismaClient } from "@prisma/client";

export interface DuplicateMatch {
  id: string;
  customerNumber: string;
  displayName: string;
  matchedOn: ("vatNumber" | "companyAndZip" | "primaryEmail")[];
}

interface FindOpts {
  companyId: string;
  /** Either user input from the create form or a draft customer record. */
  vatNumber?: string | null;
  companyName?: string | null;
  zip?: string | null;
  primaryEmail?: string | null;
  /** Exclude self when called from update flows. */
  excludeId?: string;
}

export async function findDuplicateCustomers(
  prisma: PrismaClient,
  opts: FindOpts,
): Promise<DuplicateMatch[]> {
  // Build OR-array. If nothing meaningful was provided, skip the query.
  const orClauses = [];
  if (opts.vatNumber) orClauses.push({ vatNumber: opts.vatNumber });
  if (opts.companyName && opts.zip) {
    orClauses.push({
      AND: [
        {
          companyName: {
            equals: opts.companyName,
            mode: "insensitive" as const,
          },
        },
        { addresses: { some: { zip: opts.zip } } },
      ],
    });
  }
  if (opts.primaryEmail) {
    orClauses.push({
      contacts: { some: { email: opts.primaryEmail, isPrimary: true } },
    });
  }
  if (orClauses.length === 0) return [];

  const matches = await prisma.customer.findMany({
    where: {
      companyId: opts.companyId,
      deletedAt: null,
      ...(opts.excludeId ? { NOT: { id: opts.excludeId } } : {}),
      OR: orClauses,
    },
    include: {
      contacts: {
        select: { firstName: true, lastName: true, email: true, isPrimary: true },
      },
      addresses: { select: { zip: true } },
    },
    take: 5,
  });

  return matches.map((m) => {
    const reasons: DuplicateMatch["matchedOn"] = [];
    if (opts.vatNumber && m.vatNumber === opts.vatNumber) reasons.push("vatNumber");
    if (opts.companyName && opts.zip) {
      const sameName =
        m.companyName?.toLowerCase() === opts.companyName.toLowerCase();
      const sameZip = m.addresses.some((a) => a.zip === opts.zip);
      if (sameName && sameZip) reasons.push("companyAndZip");
    }
    if (opts.primaryEmail) {
      if (m.contacts.some((c) => c.isPrimary && c.email === opts.primaryEmail)) {
        reasons.push("primaryEmail");
      }
    }
    const primary = m.contacts.find((c) => c.isPrimary) ?? m.contacts[0];
    const display =
      m.companyName ??
      (primary
        ? `${primary.firstName} ${primary.lastName}`
        : `Kunde ${m.customerNumber}`);
    return {
      id: m.id,
      customerNumber: m.customerNumber,
      displayName: display,
      matchedOn: reasons,
    };
  });
}
