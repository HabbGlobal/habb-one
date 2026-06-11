import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Passwort vergessen — HABB One",
  robots: { index: false, follow: false },
};

/**
 * Stub-Page für „Passwort vergessen?". Bis der Self-Service-Reset-Flow
 * existiert, wird der User auf den Support verwiesen. Owner kann jederzeit
 * eine Reset-Mail über /owner/tenants/[id]/users auslösen.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 py-10">
      <div className="w-full max-w-md text-center">
        <Mail className="mx-auto h-10 w-10 text-habb-muted" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-habb-black">
          Passwort vergessen?
        </h1>
        <p className="mt-3 text-sm text-habb-muted">
          Der Self-Service Passwort-Reset ist noch nicht freigeschaltet. Bitte
          melden Sie sich bei Ihrem Firmen-Administrator oder beim habb.ch
          Support, dann lösen wir Ihnen einen Reset-Link aus.
        </p>
        <div className="mt-6 space-y-2">
          <a
            href="mailto:support@habb.ch?subject=Passwort-Reset%20HABB%20One"
            className="block rounded-lg bg-habb-black px-5 py-3 text-sm font-medium text-white hover:bg-habb-ink"
          >
            support@habb.ch kontaktieren
          </a>
          <Link
            href="/login"
            className="block text-xs text-habb-muted hover:text-habb-ink"
          >
            ← Zurück zur Anmeldung
          </Link>
        </div>
      </div>
    </main>
  );
}
