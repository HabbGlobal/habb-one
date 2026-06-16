/**
 * POST /api/owner/tenants/[id]/users
 *
 * Legt einen neuen User für den Mandanten an. Zwei Init-Modi für das
 * Passwort:
 *   - "MAGIC_LINK"    : User erhält per Mail einen 1-Stunden-Reset-Link
 *                       und setzt das Passwort selbst. PasswordHash wird
 *                       mit unzugänglichem Zufallswert befüllt → ohne
 *                       Reset kein Login möglich.
 *   - "TEMP_PASSWORD" : Owner sieht einmalig ein 16-Zeichen-Passwort,
 *                       das er dem User mündlich/per Chat übermittelt.
 *                       mustChangePassword=true erzwingt den Wechsel.
 *
 * Sudo + Reason + Audit wie alle destruktiven Owner-Aktionen.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { OWNER_ASSIGNABLE_ROLES, generateTempPassword } from "@/lib/owner/users";
import { issuePasswordResetToken } from "@/lib/auth/password-reset";
import { sendMail } from "@/lib/mail/send";
import { buildPasswordResetMail } from "@/lib/mail/templates/password-reset";
import type { UserRole } from "@prisma/client";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  name: z.string().trim().min(2, "Name must be at least 2 characters long.").max(120),
  role: z.enum(OWNER_ASSIGNABLE_ROLES as [UserRole, ...UserRole[]]),
  sendMode: z.enum(["MAGIC_LINK", "TEMP_PASSWORD"]),
  preferredLanguage: z.enum(["de", "fr", "it", "en"]).default("de"),
  reason: z.string().trim().min(10, "Reason must be at least 10 characters long."),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ADMIN", sudo: true });
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" },
      { status: guard.status },
    );
  }

  const { id: companyId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "EMAIL_TAKEN", message: "This email is already taken." },
      { status: 409 },
    );
  }

  // Passwort initialisieren — Klartext fliesst NUR im TEMP_PASSWORD-Modus
  // an den Owner zurück, nirgends in die DB oder Logs.
  let tempPassword: string | null = null;
  let passwordHash: string;
  if (parsed.data.sendMode === "TEMP_PASSWORD") {
    tempPassword = generateTempPassword();
    passwordHash = await bcrypt.hash(tempPassword, 12);
  } else {
    // Unzugänglicher Zufallswert — ohne Magic-Link kein Login möglich.
    passwordHash = await bcrypt.hash(randomBytes(32).toString("base64"), 12);
  }

  const now = new Date();
  const user = await prisma.user.create({
    data: {
      companyId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
      preferredLanguage: parsed.data.preferredLanguage,
      // Owner-erstellte User: E-Mail gilt als verifiziert (Owner vouched).
      // Sonst blockt authorize() den Login mit "if (!user.emailVerifiedAt) return null".
      emailVerifiedAt: now,
      // Magic-Link-Modus: User setzt das Passwort ohnehin selbst neu beim
      // ersten Klick — kein mustChangePassword. Temp-Passwort-Modus: erzwingt
      // Wechsel (UI dafür folgt; bis dahin loggt der User trotzdem ein, weil
      // die Flag in authorize() nicht geprüft wird).
      mustChangePassword: parsed.data.sendMode === "TEMP_PASSWORD",
      isActive: true,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  // Magic-Link-Modus: Reset-Token + Mail anstossen.
  let mailDelivered = false;
  let mailExpiresAt: Date | null = null;
  if (parsed.data.sendMode === "MAGIC_LINK") {
    const { token, expiresAt } = await issuePasswordResetToken({
      userId: user.id,
      initiatedByOwnerAccountId: guard.ctx.ownerAccountId,
    });
    mailExpiresAt = expiresAt;
    const origin = new URL(req.url).origin;
    const resetUrl = `${origin}/reset-password/${token}`;
    const mail = buildPasswordResetMail({
      recipientName: user.name,
      resetUrl,
      expiresAt,
      initiatedByName: guard.ctx.name,
      initiatedByLabel: "HABB Global (PVT) LTD Support",
    });
    try {
      const result = await sendMail({
        to: user.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: "user-onboarding",
      });
      mailDelivered = result.delivered;
    } catch {
      mailDelivered = false;
    }
  }

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "USER_CREATED",
    targetCompanyId: companyId,
    targetUserId: user.id,
    reason: parsed.data.reason,
    payloadAfter: {
      email: user.email,
      name: user.name,
      role: user.role,
      sendMode: parsed.data.sendMode,
      mailDelivered: parsed.data.sendMode === "MAGIC_LINK" ? mailDelivered : null,
    },
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    sendMode: parsed.data.sendMode,
    tempPassword,
    mailDelivered,
    mailExpiresAt: mailExpiresAt?.toISOString() ?? null,
  });
}
