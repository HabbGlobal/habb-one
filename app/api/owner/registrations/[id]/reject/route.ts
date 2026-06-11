import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { sendMail } from "@/lib/mail/send";
import { buildRegistrationRejectedMail } from "@/lib/mail/templates/tenant-lifecycle";

const schema = z.object({
  reason: z.string().trim().min(10, "Begründung muss mindestens 10 Zeichen lang sein.").max(500),
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
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
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
  if (
    company.registrationStatus !== "PENDING_APPROVAL" &&
    company.registrationStatus !== "PENDING_EMAIL_VERIFICATION"
  ) {
    return NextResponse.json({ error: "NOT_PENDING" }, { status: 409 });
  }

  const now = new Date();
  await prisma.company.update({
    where: { id },
    data: {
      registrationStatus: "REJECTED",
      registrationRejectedAt: now,
      registrationRejectedByOwnerAccountId: guard.ctx.ownerAccountId,
      registrationRejectionReason: parsed.data.reason,
    },
  });

  const admin = company.users[0];
  let mailDelivered = false;
  if (admin) {
    try {
      const mail = buildRegistrationRejectedMail({
        recipientName: admin.name,
        companyName: company.name,
        reason: parsed.data.reason,
      });
      const result = await sendMail({
        to: admin.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tag: "registration-rejected",
      });
      mailDelivered = result.delivered;
    } catch {
      mailDelivered = false;
    }
  }

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_REGISTRATION_REJECTED",
    targetCompanyId: id,
    targetUserId: admin?.id ?? null,
    reason: parsed.data.reason,
    payloadAfter: { mailDelivered, adminEmail: admin?.email ?? null },
  });

  return NextResponse.json({ ok: true, mailDelivered });
}
