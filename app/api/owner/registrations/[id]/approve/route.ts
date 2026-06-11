import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { sendMail } from "@/lib/mail/send";
import { buildRegistrationApprovedMail } from "@/lib/mail/templates/tenant-lifecycle";

const schema = z.object({
  reason: z.string().trim().min(0).max(500).optional(),
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

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      registrationStatus: true,
      users: {
        where: { role: "SUPERADMIN", deletedAt: null },
        select: { id: true, email: true, name: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  if (!company) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (company.registrationStatus !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: "NOT_PENDING" }, { status: 409 });
  }

  const now = new Date();
  await prisma.company.update({
    where: { id },
    data: {
      registrationStatus: "ACTIVE",
      registrationApprovedAt: now,
      registrationApprovedByOwnerAccountId: guard.ctx.ownerAccountId,
    },
  });

  // Approval-Mail an den initialen Admin (best-effort).
  const admin = company.users[0];
  let mailDelivered = false;
  if (admin) {
    try {
      const origin = new URL(req.url).origin;
      const mail = buildRegistrationApprovedMail({
        recipientName: admin.name,
        companyName: company.name,
        loginUrl: `${origin}/login`,
      });
      const result = await sendMail({
        to: admin.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: "registration-approved",
      });
      mailDelivered = result.delivered;
    } catch {
      mailDelivered = false;
    }
  }

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_REGISTRATION_APPROVED",
    targetCompanyId: id,
    targetUserId: admin?.id ?? null,
    reason: parsed.data.reason ?? null,
    payloadAfter: { mailDelivered, adminEmail: admin?.email ?? null },
  });

  return NextResponse.json({ ok: true, mailDelivered });
}
