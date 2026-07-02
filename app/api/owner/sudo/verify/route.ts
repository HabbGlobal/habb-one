/**
 * POST /api/owner/sudo/verify
 *
 * Step-up auth: re-enter password to grant sudo mode for 5 minutes. Enforced
 * in the client before destructive actions (module toggle, suspend, notes, data
 * export, impersonation request).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { requireOwner, grantSudo } from "@/lib/owner/auth";
import { verifyOwnerPassword } from "@/lib/owner/sudo";
import { ownerAudit } from "@/lib/owner/audit";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const guard = await requireOwner();
  if (!guard.ok) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: guard.status });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const verify = await verifyOwnerPassword({
    ownerAccountId: guard.ctx.ownerAccountId,
    password: parsed.data.password,
  });
  if (!verify.ok) return NextResponse.json({ error: "INVALID" }, { status: 401 });

  await grantSudo(guard.ctx.sessionId);
  await ownerAudit({
    ownerAccountId: guard.ctx.ownerAccountId,
    ownerEmail: guard.ctx.ownerEmail,
    action: "OWNER_SUDO_GRANTED",
  });

  return NextResponse.json({ ok: true });
}
