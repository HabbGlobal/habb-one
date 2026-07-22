// Employee detail for the PIN entry screen (web + mobile kiosk client).
// Mirrors the tenant check in app/kiosk/[employeeId]/page.tsx.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readKioskLock } from "@/lib/kiosk-lock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  const lockedCompanyId = await readKioskLock();

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isActive: true,
      companyId: true,
      company: {
        select: { id: true, name: true, logoMimeType: true, updatedAt: true },
      },
    },
  });

  if (!employee || !employee.isActive) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (lockedCompanyId && employee.companyId !== lockedCompanyId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    company: {
      id: employee.company.id,
      name: employee.company.name,
      hasLogo: !!employee.company.logoMimeType,
      logoVersion: employee.company.updatedAt.getTime().toString(),
    },
  });
}
