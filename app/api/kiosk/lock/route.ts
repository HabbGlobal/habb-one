// API für Kiosk-Lock — Tablet entsperren / sperren.
//
// POST  { companyId, password }    → bei Match: setzt Cookie, returns { ok: true }
// DELETE                            → löscht Cookie (Schicht-Ende-Logout)
//
// Rate-Limit: nicht in dieser MVP — Auth-Versuche sind auf "alle 4-stelligen
// Codes ausprobieren"-Niveau aufwendig (bcrypt 10 rounds = ~80ms pro Versuch),
// dürfte für ein Werkstatt-iPad reichen. Wenn sich das als Problem zeigt,
// fügen wir IP-basiertes Rate-Limiting via @upstash/ratelimit hinzu.

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

  // Wenn keine companyId mitgegeben wurde UND nur eine Firma mit Kiosk-
  // Passwort existiert, nutze diese. WICHTIG: nur Firmen mit gesetztem
  // `kioskPasswordHash` zählen — andere Firmen sind hier irrelevant
  // (z. B. zweite Firma in der DB ohne Kiosk-Konfiguration).
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

/** Optional: Status-Check fürs Client-Polling (UI weiß ob Lock noch gilt). */
export async function GET() {
  const companyId = await readKioskLock();
  return NextResponse.json({ unlocked: !!companyId, companyId });
}
