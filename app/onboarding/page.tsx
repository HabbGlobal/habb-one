import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LogOut, Clock, ShieldX } from "lucide-react";
import Link from "next/link";
import { OnboardingProfileForm } from "./OnboardingProfileForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const company = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      city: true,
      country: true,
      registrationStatus: true,
      registrationRejectionReason: true,
      registrationSubmittedAt: true,
    },
  });
  if (!company) redirect("/login");

  const rejected = company.registrationStatus === "REJECTED";
  const pendingApproval = company.registrationStatus === "PENDING_APPROVAL";
  const pendingVerify = company.registrationStatus === "PENDING_EMAIL_VERIFICATION";

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            habb<span className="text-habb-red">.ch</span>
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-habb-black">
            Willkommen, {session.user.name}
          </h1>
          <p className="mt-1 text-sm text-habb-muted">{company.name}</p>
        </div>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 text-xs text-habb-muted hover:text-habb-ink"
          >
            <LogOut className="h-3.5 w-3.5" /> Abmelden
          </button>
        </form>
      </header>

      <section
        className={`mt-8 rounded-lg border px-5 py-4 ${rejected
            ? "border-habb-red/30 bg-habb-red/5"
            : "border-habb-warning/30 bg-habb-warning/5"
          }`}
      >
        <div className="flex items-start gap-3">
          {rejected ? (
            <ShieldX className="mt-0.5 h-5 w-5 text-habb-red" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 text-habb-warning" />
          )}
          <div>
            {rejected ? (
              <>
                <h2 className="text-base font-semibold text-habb-red">
                  Registrierung abgelehnt
                </h2>
                <p className="mt-1 text-sm text-habb-red/90">
                  {company.registrationRejectionReason ??
                    "Das HABB Global (PVT) LTD Team hat Ihre Anfrage nicht freigegeben. Bei Fragen: support@HABB Global (PVT) LTD."}
                </p>
              </>
            ) : pendingApproval ? (
              <>
                <h2 className="text-base font-semibold text-habb-warning">
                  Wartet auf Freigabe
                </h2>
                <p className="mt-1 text-sm text-habb-warning">
                  Wir prüfen Ihre Anfrage. Sobald freigegeben, erhalten Sie eine Mail und können
                  HABB One vollständig nutzen. Bis dahin können Sie Ihr Firmenprofil bearbeiten.
                </p>
              </>
            ) : pendingVerify ? (
              <>
                <h2 className="text-base font-semibold text-habb-warning">
                  E-Mail-Bestätigung ausstehend
                </h2>
                <p className="mt-1 text-sm text-habb-warning">
                  Bitte klicken Sie den Link in der Bestätigungsmail. Sobald Ihre E-Mail
                  verifiziert ist, prüft das HABB Global (PVT) LTD Team Ihre Anfrage.
                </p>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {!rejected && (
        <div className="mt-8">
          <OnboardingProfileForm
            initial={{
              name: company.name,
              phone: company.phone ?? "",
              address: company.address ?? "",
              city: company.city ?? "",
              country: company.country,
            }}
          />
        </div>
      )}
    </main>
  );
}
