import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifyEmailVerificationToken } from "@/lib/auth/email-verification";
import { sendMail } from "@/lib/mail/send";
import {
  buildRegistrationSubmittedMail,
  buildOwnerNewRegistrationMail,
} from "@/lib/mail/templates/tenant-lifecycle";

export const metadata: Metadata = {
  title: "E-Mail bestätigen — HABB One",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = await verifyEmailVerificationToken(token);

  if (!verified) {
    return (
      <Shell
        title="Link nicht (mehr) gültig"
        body="Der Bestätigungs-Link ist abgelaufen oder wurde bereits verwendet. Bitte registrieren Sie sich erneut oder wenden Sie sich an den Support."
      />
    );
  }

  // Server-seitig: Token konsumieren, User markieren, Company in
  // PENDING_APPROVAL überführen — atomar.
  const now = new Date();
  let result:
    | {
      companyId: string;
      companyName: string;
      userName: string;
      userEmail: string;
      phone: string | null;
      city: string | null;
      country: string | null;
      /** True nur wenn DIESER Klick den Übergang
       *  PENDING_EMAIL_VERIFICATION → PENDING_APPROVAL ausgelöst hat.
       *  Re-Klicks eines schon freigegebenen Tokens setzen das NICHT. */
      becamePendingApproval: boolean;
    }
    | null = null;

  try {
    result = await prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: verified.tokenId, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count === 0) {
        throw new Error("TOKEN_ALREADY_CONSUMED");
      }
      const user = await tx.user.update({
        where: { id: verified.userId },
        data: { emailVerifiedAt: now },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              registrationStatus: true,
              phone: true,
              city: true,
              country: true,
            },
          },
        },
      });
      let becamePendingApproval = false;
      if (user.company.registrationStatus === "PENDING_EMAIL_VERIFICATION") {
        await tx.company.update({
          where: { id: user.company.id },
          data: {
            registrationStatus: "PENDING_APPROVAL",
            registrationEmailVerifiedAt: now,
          },
        });
        becamePendingApproval = true;
      }
      return {
        companyId: user.company.id,
        companyName: user.company.name,
        userName: user.name,
        userEmail: user.email,
        phone: user.company.phone,
        city: user.company.city,
        country: user.company.country,
        becamePendingApproval,
      };
    });
  } catch {
    return (
      <Shell
        title="Link nicht (mehr) gültig"
        body="Der Bestätigungs-Link ist abgelaufen oder wurde bereits verwendet."
      />
    );
  }

  // Submitted-Mail an den Antragsteller (best-effort; nicht-blockend).
  try {
    const mail = buildRegistrationSubmittedMail({
      recipientName: result.userName,
      companyName: result.companyName,
    });
    await sendMail({
      to: result.userEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tag: "registration-submitted",
    });
  } catch {
    // schweigend — User wird sowieso beim Login sehen, dass es pending ist
  }

  // Owner-Notification: nur beim ECHTEN Übergang auf PENDING_APPROVAL
  // (nicht bei Re-Klick eines bereits verarbeiteten Tokens) und nur wenn
  // OWNER_NOTIFY_EMAIL konfiguriert ist. Best-effort, nicht-blockend —
  // ein fehlgeschlagener Mailversand darf die Verifizierung des Kunden
  // nicht kaputtmachen.
  const ownerNotifyEmail = process.env.OWNER_NOTIFY_EMAIL?.trim();
  if (result.becamePendingApproval && ownerNotifyEmail) {
    try {
      const origin = new URL(
        // request-origin nicht verfügbar in der Page → aus NEXTAUTH_URL
        // bzw. Fallback ableiten. Reicht für den Deep-Link in der Mail.
        process.env.NEXTAUTH_URL || "https://one.HABB Global (PVT) LTD",
      ).origin;
      const ownerMail = buildOwnerNewRegistrationMail({
        companyName: result.companyName,
        applicantName: result.userName,
        applicantEmail: result.userEmail,
        phone: result.phone,
        city: result.city,
        country: result.country,
        reviewUrl: `${origin}/owner/registrations`,
      });
      await sendMail({
        to: ownerNotifyEmail,
        subject: ownerMail.subject,
        html: ownerMail.html,
        text: ownerMail.text,
        tag: "owner-new-registration",
      });
    } catch {
      // schweigend — Owner sieht die Anfrage ohnehin in /owner/registrations
    }
  }

  return (
    <Shell
      title="E-Mail bestätigt"
      body={`Vielen Dank! Ihre E-Mail-Adresse für „${result.companyName}" ist bestätigt. Das HABB Global (PVT) LTD Team prüft jetzt Ihre Anfrage. Sie erhalten eine weitere E-Mail, sobald Ihr Zugang freigegeben ist.`}
      cta={{ label: "Zur Anmeldung", href: "/login" }}
    />
  );
}

function Shell({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 py-10">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-habb-black">{title}</h1>
        <p className="mt-3 text-sm text-habb-muted">{body}</p>
        {cta && (
          <Link
            href={cta.href}
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-habb-black px-5 py-3 text-sm font-medium text-white hover:bg-habb-ink"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </main>
  );
}
