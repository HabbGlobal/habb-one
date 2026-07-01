import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyEmployeePin, PinError } from "@/lib/pin";
import { createKioskSession } from "@/lib/kiosk-session";
import { resolveKioskCompany } from "@/lib/kiosk-company";

const schema = z.object({
  employeeId: z.string().cuid(),
  pin: z.string().regex(/^\d{4}$/),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  // Tenant isolation: resolve the company through the account session, lock
  // cookie, or single-company fallback. When resolved, the PIN user must
  // belong to that company. This applies to both account-session kiosks and
  // lock-cookie tablets.
  const { effectiveCompanyId } = await resolveKioskCompany();
  if (effectiveCompanyId) {
    const employee = await prisma.employee.findUnique({
      where: { id: parsed.data.employeeId },
      select: { companyId: true },
    });
    if (!employee || employee.companyId !== effectiveCompanyId) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  const meta = {
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
  try {
    const employee = await verifyEmployeePin(parsed.data.employeeId, parsed.data.pin, meta);
    await createKioskSession(employee.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PinError) {
      const status = e.code === "LOCKED" ? 423 : 401;
      return NextResponse.json({ error: e.code }, { status });
    }
    return NextResponse.json({ error: "ERROR" }, { status: 500 });
  }
}
