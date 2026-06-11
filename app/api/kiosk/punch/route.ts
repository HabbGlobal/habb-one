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

  // Firma 3-Wege auflösen (Account-Session ODER Lock-Cookie ODER Single-
  // Company) — kein hartes Lock-Cookie mehr verlangen, sonst schlägt das
  // Stempeln auf Account-/Single-Tenant-Kiosken fehl ("Aktion
  // fehlgeschlagen"). Der Employee MUSS aber zu dieser Firma gehören;
  // expectedCompanyId in punch.ts erzwingt das (Anti-Cross-Tenant).
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
    // Sliding refresh nur für den Lock-Cookie-Pfad — Account-Session-
    // Kioske haben kein Lock-Cookie, das verlängert werden müsste.
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
