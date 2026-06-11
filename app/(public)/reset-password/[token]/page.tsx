import type { Metadata } from "next";
import { verifyPasswordResetToken } from "@/lib/auth/password-reset";
import { prisma } from "@/lib/prisma";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen — HABB One",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({ params }: PageProps) {
  const { token } = await params;
  const verified = await verifyPasswordResetToken(token);

  if (!verified) {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-6 py-10">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-habb-black">
            Link nicht (mehr) gültig
          </h1>
          <p className="mt-3 text-sm text-habb-muted">
            Der Reset-Link ist abgelaufen oder wurde bereits verwendet. Bitte
            fordern Sie einen neuen Reset-Link beim Support an.
          </p>
        </div>
      </main>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { email: true, name: true, deletedAt: true, lockedAt: true },
  });
  if (!user || user.deletedAt || user.lockedAt) {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-6 py-10">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-habb-black">
            Konto nicht verfügbar
          </h1>
          <p className="mt-3 text-sm text-habb-muted">
            Dieser Account ist deaktiviert oder gesperrt. Bitte wenden Sie sich
            an Ihren Administrator.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-habb-black">
          Neues Passwort setzen
        </h1>
        <p className="mt-1.5 text-sm text-habb-muted">
          Konto: <span className="font-medium text-habb-ink">{user.email}</span>
        </p>
        <div className="mt-8">
          <ResetPasswordForm token={token} />
        </div>
      </div>
    </main>
  );
}
