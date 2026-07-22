// Actions-screen data (status + live stats + vacation balance) for the kiosk
// (web + mobile kiosk client). Mirrors the auth/tenant checks in
// app/kiosk/[employeeId]/actions/page.tsx: requires an active kiosk_session
// for this exact employeeId, plus the resolved company must match.

import { NextResponse } from "next/server";
import { readKioskSession } from "@/lib/kiosk-session";
import { resolveKioskCompany } from "@/lib/kiosk-company";
import {
  buildEmployeeActionSummary,
  EmployeeNotFoundError,
} from "@/lib/kiosk-employee-summary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;

  const sessionEmployeeId = await readKioskSession();
  if (sessionEmployeeId !== employeeId) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  const { effectiveCompanyId } = await resolveKioskCompany();
  if (!effectiveCompanyId) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  try {
    const serverNow = new Date();
    const summary = await buildEmployeeActionSummary(
      employeeId,
      effectiveCompanyId,
      serverNow,
    );
    return NextResponse.json({
      employeeId,
      serverNowIso: serverNow.toISOString(),
      ...summary,
    });
  } catch (e) {
    if (e instanceof EmployeeNotFoundError) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }
}
