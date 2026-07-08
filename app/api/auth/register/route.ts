/**
 * POST /api/auth/register
 *
 * Öffentlicher Endpoint für die Selbst-Registrierung neuer Mandanten.
 *
 * Ablauf:
 *   1. Validieren (Firma + Telefon + Admin-Mail + Admin-Name + Passwort + Land)
 *   2. Doppelte E-Mail abweisen (NICHT spezifisch, generische Antwort um
 *      Account-Enumeration zu erschweren)
 *   3. Mandant + Admin-User + Default-Absenztypen atomar anlegen,
 *      Status = PENDING_EMAIL_VERIFICATION
 *   4. Verify-Token ausstellen + Bestätigungsmail senden
 *   5. 201 zurück (kein Login-Cookie — User muss erst Mail bestätigen)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bootstrapNewTenant, hashPassword } from "@/lib/owner/tenant-bootstrap";
import { PLAN_KEYS } from "@/lib/pricing/plans";
import { issueEmailVerificationToken } from "@/lib/auth/email-verification";
import { sendMail } from "@/lib/mail/send";
import { buildEmailVerificationMail } from "@/lib/mail/templates/tenant-lifecycle";
import { originFromRequest } from "@/lib/owner/webauthn";

const PHONE_REGEX = /^[+0-9 ()\-./]{6,32}$/;

const schema = z.object({
  companyName: z.string().trim().min(2, "Company name must be at least 2 characters long.").max(200),
  phone: z
    .string()
    .trim()
    .min(6, "Phone number is required.")
    .max(32)
    .regex(PHONE_REGEX, "Phone number contains invalid characters."),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().min(2).max(3).toUpperCase().default("CH"),
  adminEmail: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  adminName: z.string().trim().min(2, "Name must be at least 2 characters long.").max(120),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(120),
  preferredLanguage: z.enum(["de", "fr", "it", "en"]).default("de"),
  // Auf der Preisseite gewählter Plan (?plan=…). Streng gegen die
  // Pricing-Definition validiert; fehlt/ungültig => Prisma-Default (STARTER).
  // Greift erst mit der manuellen Owner-Freigabe — bis dahin sind keine
  // Module nutzbar, der Owner sieht den Wunsch-Plan und entscheidet.
  plan: z.enum(PLAN_KEYS).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID", message: parsed.error.errors[0]?.message ?? "" },
      { status: 400 },
    );
  }

  // Doppelte Mail: 409 zurück. Wir geben das hier bewusst spezifisch zurück
  // (statt 200 "wirkt wie Erfolg"), weil der User sonst auf eine Mail
  // wartet, die nie kommt. Trade-off zwischen UX und Enumeration.
  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.adminEmail },
    select: { id: true },
  });
  if (existingUser) {
    return NextResponse.json(
      {
        error: "EMAIL_TAKEN",
        message: "An account already exists with this email address. Please sign in or reset your password.",
      },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const { companyId, userId } = await bootstrapNewTenant({
    company: {
      name: parsed.data.companyName,
      phone: parsed.data.phone,
      address: parsed.data.address ?? null,
      city: parsed.data.city ?? null,
      country: parsed.data.country,
      defaultLanguage: parsed.data.preferredLanguage,
      plan: parsed.data.plan,
    },
    admin: {
      email: parsed.data.adminEmail,
      name: parsed.data.adminName,
      passwordHash,
      preferredLanguage: parsed.data.preferredLanguage,
      emailAlreadyVerified: false,
    },
    status: "PENDING_EMAIL_VERIFICATION",
  });

  const { token, expiresAt } = await issueEmailVerificationToken({ userId });
  const origin = originFromRequest(req);
  const verifyUrl = `${origin}/verify-email/${token}`;

  let mailDelivered = false;
  try {
    const mail = buildEmailVerificationMail({
      recipientName: parsed.data.adminName,
      companyName: parsed.data.companyName,
      verifyUrl,
      expiresAt,
    });
    const result = await sendMail({
      to: parsed.data.adminEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "email-verification",
    });
    mailDelivered = result.delivered;
  } catch {
    mailDelivered = false;
  }

  return NextResponse.json(
    {
      ok: true,
      companyId,
      mailDelivered,
      // Hilfreich für den Verify-Wartebildschirm — keine Geheimnis-Info.
      maskedEmail: maskEmail(parsed.data.adminEmail),
    },
    { status: 201 },
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
