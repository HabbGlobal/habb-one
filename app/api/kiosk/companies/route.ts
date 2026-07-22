// Lists companies that have a kiosk password configured, for the
// company-picker step on the lock screen (web + mobile kiosk client).
// Mirrors the query in app/kiosk/page.tsx used for the same purpose.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const companies = await prisma.company.findMany({
    where: { kioskPasswordHash: { not: null } },
    select: { id: true, name: true, logoMimeType: true, updatedAt: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      hasLogo: !!c.logoMimeType,
      logoVersion: c.updatedAt.getTime().toString(),
    })),
  });
}
