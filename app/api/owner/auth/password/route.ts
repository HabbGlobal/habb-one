/**
 * POST /api/owner/auth/password
 *
 * Schritt 1 der Owner-Anmeldung: E-Mail + Passwort prüfen. Bei Erfolg wird
 * ein kurzlebiger Ceremony-Cookie gesetzt (5 Min), der den User durch
 * Passkey-Enrollment oder -Sign-in trägt. Die echte `OwnerSession` wird
 * **erst** nach erfolgreicher Passkey-Bestätigung angelegt.
 *
 * Antwortet bewusst generisch: weder "User nicht gefunden" noch
 * "Passwort falsch" — beide Fälle ergeben `401`, damit Account-Enumeration
 * unmöglich ist.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isOwnerPortalEnabled, ownerPortalDisabledResponse } from "@/lib/owner/feature-flag";
import { signCeremonyToken, setCeremonyCookie, readRequestContext } from "@/lib/owner/auth";
import { ownerAudit } from "@/lib/owner/audit";
import { randomBytes } from "crypto";

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

  // Always run bcrypt — even when no account exists — to keep response
  // timing constant and avoid user-enumeration via timing differences.
  const dummyHash = "$2a$12$DUMMYDUMMYDUMMYDUMMYDU.fakefakefakefakefakefakefakefakefakefaa";
  const passwordHash = account?.passwordHash ?? dummyHash;
  const passwordOk = await bcrypt.compare(parsed.data.password, passwordHash);

  if (!account || !account.isActive || !passwordOk) {
    // Lightweight failed-login audit — only when we *do* know the account,
    // so we don't pollute the log with random typos against unknown emails.
    if (account) {
      const { ip, ua } = await readRequestContext();
      // Direct write (not via ownerAudit) because we want to capture the
      // attempt even though the actor isn't fully authenticated.
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

  // Ceremony challenge wird hier nur als Marker verwendet (wirkliche
  // WebAuthn-Challenges werden in den enroll/signin-options-Endpoints frisch
  // generiert und in einem nachfolgenden Ceremony-Token überschrieben).
  const challengeMarker = randomBytes(16).toString("base64url");
  const next = account.webauthnEnrolledAt ? "signin" : "enroll";

  const token = await signCeremonyToken({
    ownerAccountId: account.id,
    stage: next === "enroll" ? "ENROLL" : "SIGNIN",
    challenge: challengeMarker,
  });
  await setCeremonyCookie(token);

  return NextResponse.json({ next });
}
