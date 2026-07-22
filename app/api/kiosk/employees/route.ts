// Employee grid for the kiosk picker screen (web + mobile kiosk client).
// Requires the tablet/app to be unlocked for a company (account session,
// kiosk_lock cookie, or single-company fallback — see resolveKioskCompany).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveKioskCompany } from "@/lib/kiosk-company";
import { buildEmployeeTiles } from "@/lib/kiosk-tiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { effectiveCompanyId } = await resolveKioskCompany();
  if (!effectiveCompanyId) {
    return NextResponse.json({ error: "LOCKED" }, { status: 401 });
  }

  const serverNow = new Date();

  const [{ employees }, company] = await Promise.all([
    buildEmployeeTiles(effectiveCompanyId, serverNow),
    prisma.company.findUnique({
      where: { id: effectiveCompanyId },
      select: { id: true, name: true, logoMimeType: true, updatedAt: true },
    }),
  ]);

  if (!company) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    company: {
      id: company.id,
      name: company.name,
      hasLogo: !!company.logoMimeType,
      logoVersion: company.updatedAt.getTime().toString(),
    },
    serverNowIso: serverNow.toISOString(),
    employees,
  });
}
