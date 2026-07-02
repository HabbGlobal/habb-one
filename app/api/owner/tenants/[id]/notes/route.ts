import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({
  /** Markdown / plain text. Max 8 KB is more than enough for internal notes. */
  notes: z.string().max(8000),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner({ minRole: "OWNER_ADMIN", sudo: true });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.status === 403 ? "SUDO_REQUIRED" : "UNAUTHORIZED" }, {
      status: guard.status,
    });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const before = await prisma.company.findUnique({
    where: { id },
    select: { id: true, internalNotes: true },
  });
  if (!before) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const newNotes = parsed.data.notes.trim() === "" ? null : parsed.data.notes;
  await prisma.company.update({ where: { id }, data: { internalNotes: newNotes } });

  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "TENANT_NOTES_UPDATED",
    targetCompanyId: id,
    payloadBefore: { internalNotes: before.internalNotes ?? null },
    payloadAfter: { internalNotes: newNotes ?? null },
  });

  return NextResponse.json({ ok: true });
}
