/**
 * POST /api/owner/team - create a new owner account (OWNER_ROOT only)
 *
 * Server generates a 16-character initial password and returns it exactly ONCE
 * (show-once modal in the UI). Passkey enrollment is required on first login.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  role: z.enum(["OWNER_SUPPORT", "OWNER_ADMIN", "OWNER_ROOT"]),
  reason: z.string().trim().min(10).max(500),
});

function generateInitialPassword(): string {
  // 16 characters from URL-safe base64 - about 96 bits of entropy, enough for a
  // One-time password that is changed on first login.
  return randomBytes(12).toString("base64url").slice(0, 16);
}

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ROOT", sudo: true });
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

  // Email conflict: existing OwnerAccount with the same address?
  const existing = await prisma.ownerAccount.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_EXISTS" }, { status: 409 });
  }

  const initialPassword = generateInitialPassword();
  const passwordHash = await bcrypt.hash(initialPassword, 12);

  const created = await prisma.ownerAccount.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash,
      isActive: true,
    },
    select: { id: true, email: true, role: true },
  });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_ACCOUNT_CREATED",
    reason: parsed.data.reason,
    payloadAfter: {
      newOwnerId: created.id,
      newOwnerEmail: created.email,
      role: created.role,
    },
  });

  return NextResponse.json({
    ok: true,
    ownerId: created.id,
    initialPassword,
  });
}
