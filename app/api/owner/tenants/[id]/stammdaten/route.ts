/**
 * PUT /api/owner/tenants/[id]/stammdaten
 *
 * Erlaubt dem Owner, ausgewählte Stammdaten-Felder eines Mandanten zu
 * ändern. HR-/Operations-Config bleibt bewusst dem Tenant-Admin überlassen
 * (Default-Stunden, Schwellwerte, Rundung, …) — wir editieren hier nur
 * Identitäts- und Rechnungs-Felder.
 *
 * Sudo + Reason + Audit-Trail wie bei allen destruktiven Owner-Aktionen.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const ALLOWED_LANGUAGES = ["de", "fr", "it", "en"] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Name muss mindestens 2 Zeichen lang sein.").max(200),
  address: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(120).nullable(),
  country: z.string().trim().min(2).max(3).toUpperCase(),
  timezone: z.string().trim().min(3).max(80),
  defaultLanguage: z.enum(ALLOWED_LANGUAGES),
  vatNumber: z.string().trim().max(64).nullable(),
  qrIban: z.string().trim().max(34).nullable(),
  invoiceCreditorName: z.string().trim().max(200).nullable(),
  invoicePaymentTerms: z.number().int().min(0).max(365),
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
});

type StammdatenInput = z.infer<typeof schema>;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ADMIN", sudo: true });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" },
      { status: guard.status },
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const before = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      country: true,
      timezone: true,
      defaultLanguage: true,
      vatNumber: true,
      qrIban: true,
      invoiceCreditorName: true,
      invoicePaymentTerms: true,
    },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const data: StammdatenInput = parsed.data;

  // Normalise: leere Strings, die wir als nullable behandeln, → null.
  const norm = {
    name: data.name,
    address: emptyToNull(data.address),
    city: emptyToNull(data.city),
    country: data.country,
    timezone: data.timezone,
    defaultLanguage: data.defaultLanguage,
    vatNumber: emptyToNull(data.vatNumber),
    qrIban: emptyToNull(data.qrIban),
    invoiceCreditorName: emptyToNull(data.invoiceCreditorName),
    invoicePaymentTerms: data.invoicePaymentTerms,
  };

  await prisma.company.update({
    where: { id },
    data: norm,
  });

  const diff = diffFields(before, norm);
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_STAMMDATEN_UPDATED",
    targetCompanyId: id,
    reason: data.reason,
    payloadBefore: diff.before as Prisma.InputJsonValue,
    payloadAfter: diff.after as Prisma.InputJsonValue,
  });

  return NextResponse.json({ ok: true });
}

function emptyToNull(s: string | null): string | null {
  return s === null ? null : s.trim() === "" ? null : s.trim();
}

/**
 * Schreibt in den Audit nur die tatsächlich geänderten Felder mit before/
 * after. Spart Lärm und macht spätere Suche im Audit-Log einfacher.
 */
function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a };
}
