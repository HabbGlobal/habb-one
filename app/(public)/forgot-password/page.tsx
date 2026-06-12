import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Forgot Password — HABB One",
  robots: { index: false, follow: false },
};

/**
 * Stub-Page for "Forgot Password?". Until the self-service reset flow
 * exists, the user is directed to support. Owner can always
 * trigger a reset mail via /owner/tenants/[id]/users.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-6 py-10">
      <div className="w-full max-w-md text-center">
        <Mail className="mx-auto h-10 w-10 text-habb-muted" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-habb-black">
          Forgot your password?
        </h1>
        <p className="mt-3 text-sm text-habb-muted">
          The self-service password reset is not active yet. Please
          contact your company administrator or HABB Global (PVT) LTD
          support to get a reset link.
        </p>
        <div className="mt-6 space-y-2">
          <a
            href="mailto:support@HABB Global (PVT) LTD?subject=Password-Reset%20HABB%20One"
            className="block rounded-lg bg-habb-black px-5 py-3 text-sm font-medium text-white hover:bg-habb-ink"
          >
            Contact support
          </a>
          <Link
            href="/login"
            className="block text-xs text-habb-muted hover:text-habb-ink"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
