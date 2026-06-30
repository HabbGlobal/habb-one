import { NextResponse } from "next/server";
import { z } from "zod";
import { extendKioskSession, readKioskSession } from "@/lib/kiosk-session";
import { extendKioskLock, readKioskLock } from "@/lib/kiosk-lock";
import { resolveKioskCompany } from "@/lib/kiosk-company";
import { breakEnd, breakStart, clockIn, clockOut, PunchError } from "@/lib/time/punch";

const schema = z.object({
  action: z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]),
});

export async function POST(req: Request) {
  const employeeId = await readKioskSession();
  if (!employeeId) return NextResponse.json({ error: "UNAUTH" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  // Resolve the company through the account session, lock cookie, or
  // single-company fallback. Do not require a lock cookie because account and
  // single-tenant kiosks may not have one. The employee must still belong to
  // this company; expectedCompanyId in punch.ts enforces tenant isolation.
  const { effectiveCompanyId } = await resolveKioskCompany();
  if (!effectiveCompanyId) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }

  try {
    const action = parsed.data.action;
    const opts = { expectedCompanyId: effectiveCompanyId };
    if (action === "CLOCK_IN") await clockIn(employeeId, opts);
    else if (action === "CLOCK_OUT") await clockOut(employeeId, opts);
    else if (action === "BREAK_START") await breakStart(employeeId, opts);
    else await breakEnd(employeeId, opts);
    // Sliding window: a successful action keeps the kiosk session alive.
    await extendKioskSession(employeeId);
    // Refresh only the lock-cookie path. Account-session kiosks have no lock
    // cookie that needs extending.
    const lockCookie = await readKioskLock();
    if (lockCookie) await extendKioskLock(lockCookie);
    return NextResponse.json({ ok: true, action, at: new Date().toISOString() });
  } catch (e) {
    if (e instanceof PunchError) {
      return NextResponse.json({ error: e.code }, { status: 409 });
    }
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }
}
