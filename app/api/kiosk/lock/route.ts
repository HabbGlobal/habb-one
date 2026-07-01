// Kiosk lock API for unlocking and locking the tablet.
//
// POST  { companyId, password } → on match, set the cookie and return { ok: true }
// DELETE                         → delete the cookie for end-of-shift logout
//
// Rate limiting is not included in this MVP. Authentication attempts are
// deliberately expensive because bcrypt uses 10 rounds. If abuse becomes a
// concern, add IP-based rate limiting with @upstash/ratelimit.

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  createKioskLock,
  clearKioskLock,
  readKioskLock,
} from "@/lib/kiosk-lock";

export const runtime = "nodejs";

const postSchema = z.object({
  companyId: z.string().cuid().or(z.string().min(1)).optional(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  const { companyId: hintedCompanyId, password } = parsed.data;

  // If companyId is omitted and exactly one company has a kiosk password, use
  // that company. Only companies with `kioskPasswordHash` are relevant here.
  let target;
  if (hintedCompanyId) {
    target = await prisma.company.findUnique({
      where: { id: hintedCompanyId },
      select: { id: true, kioskPasswordHash: true },
    });
  } else {
    const protectedCompanies = await prisma.company.findMany({
      where: { kioskPasswordHash: { not: null } },
      select: { id: true, kioskPasswordHash: true },
      take: 2,
    });
    if (protectedCompanies.length === 1) {
      target = protectedCompanies[0];
    } else {
      return NextResponse.json(
        { error: "COMPANY_REQUIRED" },
        { status: 400 },
      );
    }
  }

  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!target.kioskPasswordHash) {
    return NextResponse.json(
      { error: "NO_PASSWORD_SET" },
      { status: 409 },
    );
  }

  const ok = await bcrypt.compare(password, target.kioskPasswordHash);
  if (!ok) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 401 });
  }

  await createKioskLock(target.id);
  return NextResponse.json({ ok: true, companyId: target.id });
}

export async function DELETE() {
  await clearKioskLock();
  return NextResponse.json({ ok: true });
}

/** Optional status check for client polling so the UI knows whether the lock is valid. */
export async function GET() {
  const companyId = await readKioskLock();
  return NextResponse.json({ unlocked: !!companyId, companyId });
}
