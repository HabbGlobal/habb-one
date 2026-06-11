// Auto-generates invoice numbers per fiscal year:  RG-YYYY-NNNNN

import type { Prisma } from "@prisma/client";

const YEAR_RE = /^RG-(\d{4})-(\d{5,})$/;

export async function generateInvoiceNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  year: number,
): Promise<string> {
  const prefix = `RG-${year}-`;
  const last = await tx.invoice.findFirst({
    where: {
      companyId,
      invoiceNumber: { startsWith: prefix },
    },
    select: { invoiceNumber: true },
    orderBy: { invoiceNumber: "desc" },
  });

  let next = 1;
  if (last) {
    const m = YEAR_RE.exec(last.invoiceNumber);
    if (m && m[1] === String(year)) {
      next = parseInt(m[2], 10) + 1;
    }
  }
  return `${prefix}${String(next).padStart(5, "0")}`;
}
