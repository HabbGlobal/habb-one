import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/PublicHeader";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Privacy Policy — HABB One",
  description: "How HABB One collects, uses, and protects data across the ERP web app and admin console.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "July 24, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-habb-ink">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-habb-black">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-habb-muted">Last updated: {LAST_UPDATED}</p>
        <p className="mt-2 text-sm text-habb-muted">
          Looking for the mobile kiosk app&rsquo;s privacy policy?{" "}
          <Link href="/privacy/app/kiosk" className="underline underline-offset-2">
            See the Kiosk App Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-habb-ink">
          <LegalSection title="1. Who We Are">
            <p>
              HABB One is operated by HABB Global (Pvt) Ltd (&ldquo;HABB
              Global&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains how we collect,
              use, and safeguard information when you use the HABB One web
              application, admin console, and owner portal (the &ldquo;Service&rdquo;).
            </p>
          </LegalSection>

          <LegalSection title="2. Information We Collect">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Account data:</strong> name, work email, password
                hash, role, and company association.
              </li>
              <li>
                <strong>Business data entered by you:</strong> customer
                records, quotes, orders, invoices, employee records, schedules,
                and time entries — entered by your company&rsquo;s users to operate
                the Service.
              </li>
              <li>
                <strong>Usage data:</strong> log-in timestamps, IP address,
                browser type, and audit-trail events (who did what and when)
                for security and support purposes.
              </li>
              <li>
                <strong>Cookies:</strong> session cookies required for
                authentication and to keep the kiosk lock/session state; we do
                not use third-party advertising cookies.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="3. How We Use Information">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To provide, maintain, and secure the Service.</li>
              <li>To authenticate users and enforce access control between tenants.</li>
              <li>To generate the reports, exports, and documents you request (invoices, payroll, PDFs, etc.).</li>
              <li>To send transactional emails (login codes, invoices, account notices) — never marketing without consent.</li>
              <li>To provide customer support and diagnose technical issues.</li>
            </ul>
          </LegalSection>

          <LegalSection title="4. Legal Basis and Data Ownership">
            <p>
              Your company (the &ldquo;Customer&rdquo;) is the data controller for the
              business and employee data it enters into the Service; HABB
              Global acts as the data processor. Data is processed under the
              Customer&rsquo;s instructions as set out in our{" "}
              <Link href="/terms" className="underline underline-offset-2">
                Terms &amp; Conditions
              </Link>
              .
            </p>
          </LegalSection>

          <LegalSection title="5. Data Storage and Security">
            <p>
              Data is stored on secure, access-controlled servers with daily
              backups. All connections are encrypted in transit (TLS).
              Sensitive actions are recorded in an audit trail. Support staff
              access to a tenant&rsquo;s data (&ldquo;owner impersonation&rdquo;) requires an
              explicit, time-limited confirmation code sent to the Customer by
              email — it is never granted silently.
            </p>
          </LegalSection>

          <LegalSection title="6. Data Sharing">
            <p>
              We do not sell personal data. We only share data with
              subprocessors that help us run the Service (e.g. hosting,
              database, email delivery, PDF generation) under confidentiality
              obligations, or where required by law. Enterprise customers may
              opt in to two-way sync with third-party accounting platforms
              (Bexio, Abacus, AbaNinja) — this only happens if explicitly
              configured by the Customer.
            </p>
          </LegalSection>

          <LegalSection title="7. Data Retention">
            <p>
              We retain Customer Data for as long as the subscription is
              active. After termination, data remains available for export
              for 30 days and is then deleted, except where retention is
              required by law (e.g. financial records for statutory retention
              periods).
            </p>
          </LegalSection>

          <LegalSection title="8. Your Rights">
            <p>
              Depending on your jurisdiction, you may have the right to
              access, correct, export, or request deletion of your personal
              data. Employees should raise such requests with their employer
              (the Customer), who controls the underlying records; employers
              can contact us directly for platform-level requests at{" "}
              <a href="mailto:privacy@habbglobal.com" className="underline underline-offset-2">
                privacy@habbglobal.com
              </a>
              .
            </p>
          </LegalSection>

          <LegalSection title="9. Children's Privacy">
            <p>
              The Service is intended for business use by adults and is not
              directed at children. We do not knowingly collect personal data
              from children.
            </p>
          </LegalSection>

          <LegalSection title="10. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Material
              changes will be communicated by email or in-app notice before
              taking effect.
            </p>
          </LegalSection>

          <LegalSection title="11. Contact">
            <p>
              Questions about this policy or a data request can be sent to{" "}
              <a href="mailto:privacy@habbglobal.com" className="underline underline-offset-2">
                privacy@habbglobal.com
              </a>
              .
            </p>
          </LegalSection>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-habb-black">{title}</h2>
      <div className="mt-2 space-y-2 text-habb-muted">{children}</div>
    </section>
  );
}
