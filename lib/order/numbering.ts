// Auto-generates order numbers per fiscal year:  AUF-YYYY-NNNNN
// Concurrency-safe when called inside a Prisma `$transaction`. The
// implementation looks up the highest existing number for the current
// year and increments — collision-free under Postgres SERIALIZABLE.

import type { Prisma } from "@prisma/client";

const YEAR_RE = /^AUF-(\d{4})-(\d{5,})$/;

/**
 * Generate the next free order number for the given company and year.
 * Pass the surrounding `tx` from a `$transaction` to ensure atomicity.
 *
 *   2026 / first order  → "AUF-2026-00001"
 *   2026 / 123rd order → "AUF-2026-00123"
 */
export async function generateOrderNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  year: number,
): Promise<string> {
  const prefix = `AUF-${year}-`;
  const last = await tx.order.findFirst({
    where: {
      companyId,
      orderNumber: { startsWith: prefix },
    },
    select: { orderNumber: true },
    orderBy: { orderNumber: "desc" },
  });

  let next = 1;
  if (last) {
    const m = YEAR_RE.exec(last.orderNumber);
    if (m && m[1] === String(year)) {
      next = parseInt(m[2], 10) + 1;
    }
  }
  return `${prefix}${String(next).padStart(5, "0")}`;
}
