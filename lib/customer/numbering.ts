// Auto-generates customer numbers per fiscal year:  KD-YYYY-NNNN
// Concurrency-safe when called inside a Prisma `$transaction`. The
// implementation looks up the highest existing number for the current
// year and increments — collision-free under Postgres SERIALIZABLE.

import type { Prisma } from "@prisma/client";

const YEAR_RE = /^KD-(\d{4})-(\d{4,})$/;

/**
 * Generate the next free customer number for the given company and year.
 * Pass the surrounding `tx` from a `$transaction` to ensure atomicity.
 *
 *   2026 / first customer  → "KD-2026-0001"
 *   2026 / 42nd customer  → "KD-2026-0042"
 */
export async function generateCustomerNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  year: number,
): Promise<string> {
  const prefix = `KD-${year}-`;
  const last = await tx.customer.findFirst({
    where: {
      companyId,
      customerNumber: { startsWith: prefix },
    },
    select: { customerNumber: true },
    orderBy: { customerNumber: "desc" },
  });

  let next = 1;
  if (last) {
    const m = YEAR_RE.exec(last.customerNumber);
    if (m && m[1] === String(year)) {
      next = parseInt(m[2], 10) + 1;
    }
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}
