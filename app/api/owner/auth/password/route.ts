/**
 * POST /api/owner/auth/password
 *
 * Owner login: verify email + password. On success, create a session
 * directly (passkey step skipped for now).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { createOwnerSession, setSessionCookie, readRequestContext } from "@/lib/owner/auth";

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  if (!isOwnerPortalEnabled()) return ownerPortalDisabledResponse();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const account = await prisma.ownerAccount.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  // Always run bcrypt to keep timing constant (prevent user enumeration).
  const dummyHash = "$2a$12$DUMMYDUMMYDUMMYDUMMYDU.fakefakefakefakefakefakefakefakefakefaa";
  const passwordHash = account?.passwordHash ?? dummyHash;
  const passwordOk = await bcrypt.compare(parsed.data.password, passwordHash);

  if (!account || !account.isActive || !passwordOk) {
    if (account) {
      const { ip, ua } = await readRequestContext();
      await prisma.ownerAuditLog.create({
        data: {
          ownerAccountId: account.id,
          ownerEmail: account.email,
          action: "OWNER_LOGIN_FAILED",
          ipAddress: ip,
          userAgent: ua,
        },
      });
    }
    return NextResponse.json({ error: "INVALID" }, { status: 401 });
  }

  // Create session directly (passkey skipped)
  const { ip, ua } = await readRequestContext();
  const token = await createOwnerSession({
    ownerAccountId: account.id,
    role: account.role,
    ipAddress: ip,
    userAgent: ua,
  });
  await setSessionCookie(token);

  return NextResponse.json({ next: "done", redirect: "/owner" });
}
