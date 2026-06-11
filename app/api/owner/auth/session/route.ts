import { NextResponse } from "next/server";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { getOwnerContext } from "@/lib/owner/auth";

export async function GET() {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const ctx = await getOwnerContext();
  if (!ctx) return NextResponse.json({ authenticated: false }, { status: 401 });

  return NextResponse.json({
    authenticated: true,
    ownerAccountId: ctx.ownerAccountId,
    email: ctx.ownerEmail,
    name: ctx.name,
    role: ctx.role,
    sudoActive: ctx.sudoActive,
  });
}
