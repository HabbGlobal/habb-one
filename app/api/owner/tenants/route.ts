/**
 * POST /api/owner/tenants
 *
 * Owner legt manuell einen neuen Mandanten an. Geht in den ACTIVE-Status
 * direkt (Owner vouched), kein E-Mail-Verify nötig. Initialer Admin bekommt
 * SUPERADMIN-Rolle — das ist der einzige sanktionierte Weg, SUPERADMIN
 * zu vergeben (über das Owner-Portal).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { bootstrapNewTenant, hashPassword } from "@/lib/owner/tenant-bootstrap";
import { generateTempPassword } from "@/lib/owner/users";
import { issuePasswordResetToken } from "@/lib/auth/password-reset";
import { sendMail } from "@/lib/mail/send";
import { buildPasswordResetMail } from "@/lib/mail/templates/password-reset";

const PHONE_REGEX = /^[+0-9 ()\-./]{6,32}$/;

const schema = z.object({
  companyName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(6).max(32).regex(PHONE_REGEX, "Telefonnummer enthält ungültige Zeichen."),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().min(2).max(3).toUpperCase().default("CH"),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminName: z.string().trim().min(2).max(120),
  preferredLanguage: z.enum(["de", "fr", "it", "en"]).default("de"),
  sendMode: z.enum(["MAGIC_LINK", "TEMP_PASSWORD"]),
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein."),
});

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ADMIN", sudo: true });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" },
      { status: guard.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.adminEmail },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "EMAIL_TAKEN", message: "Diese E-Mail ist bereits vergeben." },
      { status: 409 },
    );
  }

  // Passwort: bei TEMP einmalig anzeigen, bei MAGIC_LINK Random-Hash setzen
  // (unzugänglich, bis Reset-Mail geklickt).
  let tempPassword: string | null = null;
  let passwordHash: string;
  if (parsed.data.sendMode === "TEMP_PASSWORD") {
    tempPassword = generateTempPassword();
    passwordHash = await hashPassword(tempPassword);
  } else {
    passwordHash = await hashPassword(randomBytes(32).toString("base64"));
  }

  const { companyId, userId } = await bootstrapNewTenant({
    company: {
      name: parsed.data.companyName,
      phone: parsed.data.phone,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      country: parsed.data.country,
      defaultLanguage: parsed.data.preferredLanguage,
    },
    admin: {
      email: parsed.data.adminEmail,
      name: parsed.data.adminName,
      passwordHash,
      preferredLanguage: parsed.data.preferredLanguage,
      emailAlreadyVerified: true,
      mustChangePassword: parsed.data.sendMode === "TEMP_PASSWORD",
    },
    status: "ACTIVE",
  });

  let mailDelivered = false;
  if (parsed.data.sendMode === "MAGIC_LINK") {
    const { token, expiresAt } = await issuePasswordResetToken({
      userId,
      initiatedByOwnerAccountId: guard.ctx.ownerAccountId,
    });
    const origin = new URL(req.url).origin;
    const resetUrl = `${origin}/reset-password/${token}`;
    const mail = buildPasswordResetMail({
      recipientName: parsed.data.adminName,
      resetUrl,
      expiresAt,
      initiatedByName: guard.ctx.name,
      initiatedByLabel: "HABB Global (PVT) LTD Support",
    });
    try {
      const result = await sendMail({
        to: parsed.data.adminEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: "tenant-bootstrap",
      });
      mailDelivered = result.delivered;
    } catch {
      mailDelivered = false;
    }
  }

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_CREATED",
    targetCompanyId: companyId,
    targetUserId: userId,
    reason: parsed.data.reason,
    payloadAfter: {
      companyName: parsed.data.companyName,
      phone: parsed.data.phone,
      adminEmail: parsed.data.adminEmail,
      sendMode: parsed.data.sendMode,
      mailDelivered: parsed.data.sendMode === "MAGIC_LINK" ? mailDelivered : null,
    },
  });

  return NextResponse.json({
    ok: true,
    companyId,
    userId,
    sendMode: parsed.data.sendMode,
    tempPassword,
    mailDelivered,
  });
}
