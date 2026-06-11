// Auto-generates quote numbers per fiscal year:  OFF-YYYY-NNNN
// Concurrency-safe within a Prisma `$transaction`.

import type { Prisma } from "@prisma/client";

const YEAR_RE = /^OFF-(\d{4})-(\d{4,})$/;

export async function generateQuoteNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  year: number,
): Promise<string> {
  const prefix = `OFF-${year}-`;
  const last = await tx.quote.findFirst({
    where: {
      companyId,
      quoteNumber: { startsWith: prefix },
    },
    select: { quoteNumber: true },
    orderBy: { quoteNumber: "desc" },
  });

  let next = 1;
  if (last) {
    const m = YEAR_RE.exec(last.quoteNumber);
    if (m && m[1] === String(year)) {
      next = parseInt(m[2], 10) + 1;
    }
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}
