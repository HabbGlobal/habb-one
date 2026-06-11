/**
 * PUT /api/admin/onboarding/stammdaten
 *
 * Tenant-Admin (SUPERADMIN) bearbeitet sein Firmenprofil im Pending-Modus.
 * Nur die im Onboarding-Formular angezeigten Felder sind editierbar; alles
 * andere bleibt unangetastet. Endpoint blockt Mandanten im ACTIVE-Modus —
 * dort gibt es die volle Stammdaten-Verwaltung über Owner-Portal oder
 * (später) Admin-Settings.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PHONE_REGEX = /^[+0-9 ()\-./]{6,32}$/;

const schema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(6).max(32).regex(PHONE_REGEX),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().min(2).max(3).toUpperCase(),
});

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.user.registrationStatus === "ACTIVE") {
    // Aktive Mandanten haben den vollen Stammdaten-Editor über das normale
    // Admin-UI — dieser Endpoint ist nur für den Pending-Modus.
    return NextResponse.json({ error: "ACTIVE_TENANT" }, { status: 403 });
  }
  if (session.user.role !== "SUPERADMIN" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  await prisma.company.update({
    where: { id: session.user.companyId },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      address: parsed.data.address?.trim() || null,
      city: parsed.data.city?.trim() || null,
      country: parsed.data.country,
    },
  });

  return NextResponse.json({ ok: true });
}
