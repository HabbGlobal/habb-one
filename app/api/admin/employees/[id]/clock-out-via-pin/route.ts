// Admin-Kontext-Endpoint: stempelt einen Mitarbeiter über seinen PIN aus,
// wenn CEO/Sekretariat die Sheet-Bearbeitung freigeschaltet bekommen will
// und der Mitarbeiter gerade aktiv eingestempelt ist.
//
// Sicherheits-Modell:
//   1. Admin-Session muss vorhanden sein (auth())
//   2. Admin braucht `timeEntries.correct`-Permission
//   3. Tenant-Isolation: Mitarbeiter MUSS in der gleichen Firma sein
//   4. PIN wird via verifyEmployeePin geprüft (rate-limited, Audit-getragen)
//   5. Erst dann ruft die Route clockOut() mit source=ADMIN_CORRECTION,
//      correctedById=admin.id, reason="PIN-Verify durch <admin>"
//
// Wichtig: setzt KEIN `kiosk_session`-Cookie. Der Admin bleibt mit seiner
// regulären NextAuth-Session unterwegs, der reguläre Kiosk-Betrieb ist
// nicht betroffen.

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifyEmployeePin, PinError } from "@/lib/pin";
import { clockOut, breakEnd, getCurrentKioskState, PunchError } from "@/lib/time/punch";

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, "PIN muss 4 Ziffern haben."),
});

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTH" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, "timeEntries.correct")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id: employeeId } = await ctx.params;

  // Tenant-Isolation
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
  if (!employee || employee.companyId !== session.user.companyId) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Body
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  // PIN-Verifikation (rate-limited, hat eigene Audit-Spur)
  try {
    await verifyEmployeePin(employeeId, parsed.data.pin, {
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
  } catch (e) {
    if (e instanceof PinError) {
      const status = e.code === "LOCKED" ? 423 : 401;
      return NextResponse.json({ error: e.code }, { status });
    }
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }

  // Live-State prüfen — nur sinnvoll wenn aktuell eingestempelt
  const state = await getCurrentKioskState(employeeId, {
    expectedCompanyId: session.user.companyId,
  });
  if (state.status === "OUT" || state.status === "EMPTY" || state.status === "CLOSED") {
    return NextResponse.json({ error: "NOT_CLOCKED_IN" }, { status: 409 });
  }

  // Pause beenden (wenn aktiv), dann ausstempeln. Beides als
  // ADMIN_CORRECTION mit correctedById + reason markieren.
  const reason = `PIN-Verify durch ${session.user.name || session.user.email}`;
  try {
    if (state.status === "ON_BREAK") {
      await breakEnd(employeeId, {
        expectedCompanyId: session.user.companyId,
        source: "ADMIN_CORRECTION",
        correctedById: session.user.id,
        reason,
      });
    }
    await clockOut(employeeId, {
      expectedCompanyId: session.user.companyId,
      source: "ADMIN_CORRECTION",
      correctedById: session.user.id,
      reason,
    });
  } catch (e) {
    if (e instanceof PunchError) {
      return NextResponse.json({ error: e.code }, { status: 409 });
    }
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    employee: { id: employee.id, name: `${employee.firstName} ${employee.lastName}` },
    at: new Date().toISOString(),
  });
}
