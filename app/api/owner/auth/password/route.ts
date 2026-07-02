/**
 * POST /api/owner/auth/password
 *
 * Owner login step 1: verify email + password. On success, issue a short-lived
 * ceremony cookie and return `{ next: "enroll" | "signin" }` so the client
 * routes to the appropriate passkey page. The real OwnerSession is only created
 * after successful passkey verification (enroll-verify or signin-verify).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { signCeremonyToken, setCeremonyCookie, readRequestContext } from "@/lib/owner/auth";

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

  // Determine whether the owner needs to enroll a passkey or sign in with one.
  const needsEnroll = !account.webauthnEnrolledAt;
  const stage = needsEnroll ? "ENROLL" : "SIGNIN";

  // Issue a short-lived ceremony cookie; no session is created yet.
  const ceremonyToken = await signCeremonyToken({
    ownerAccountId: account.id,
    stage,
    challenge: randomBytes(16).toString("base64url"),
  });
  await setCeremonyCookie(ceremonyToken);

  return NextResponse.json({ next: needsEnroll ? "enroll" : "signin" });
}
