import type { Metadata } from "next";
import { PublicHeader } from "@/components/marketing/PublicHeader";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Terms & Conditions — HABB One",
  description: "Terms and conditions for using the HABB One ERP platform and kiosk time-tracking app.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "July 24, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-habb-ink">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-habb-black">
          Terms &amp; Conditions
        </h1>
        <p className="mt-3 text-sm text-habb-muted">Last updated: {LAST_UPDATED}</p>

        <div className="prose-legal mt-10 space-y-8 text-sm leading-relaxed text-habb-ink">
          <LegalSection title="1. Acceptance of Terms">
            <p>
              These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern access to and use of
              HABB One, a modular ERP platform for workshop businesses,
              including its web application, admin console, owner portal, and
              the kiosk time-tracking app (together, the &ldquo;Service&rdquo;), provided
              by HABB Global (Pvt) Ltd (&ldquo;HABB Global&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By
              creating an account, starting a trial, or otherwise using the
              Service, you agree to be bound by these Terms on behalf of
              yourself and, if applicable, the company you represent (the
              &ldquo;Customer&rdquo;).
            </p>
          </LegalSection>

          <LegalSection title="2. Accounts and Eligibility">
            <p>
              You must provide accurate registration information and keep
              your login credentials confidential. You are responsible for
              all activity under your account, including actions taken by
              employees your company grants access to (e.g. kiosk PIN
              logins). Notify us immediately of any unauthorized use.
            </p>
          </LegalSection>

          <LegalSection title="3. Subscriptions, Trial, and Billing">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                New tenants receive a 14-day free trial with all modules
                unlocked and no credit card required.
              </li>
              <li>
                Unless upgraded or cancelled before the trial ends, the
                account automatically converts to the Starter plan at the
                then-current price shown on the{" "}
                <a href="/pricing" className="underline underline-offset-2">
                  Pricing page
                </a>
                .
              </li>
              <li>
                Subscriptions are billed monthly in advance, in US dollars,
                and include VAT at the rate stated on the Pricing page.
              </li>
              <li>
                Plans may be upgraded at any time (effective immediately,
                prorated on the next invoice) or downgraded/cancelled at any
                time (effective at the end of the current billing period).
              </li>
              <li>
                Fees are non-refundable except where required by law or
                expressly stated otherwise.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="4. Customer Data">
            <p>
              You retain all rights to the data you input into the Service
              (customer records, employee records, time entries, invoices,
              and similar business data, collectively &ldquo;Customer Data&rdquo;). We
              process Customer Data solely to provide and support the
              Service, in accordance with our{" "}
              <a href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </a>
              . You are responsible for ensuring you have the necessary rights
              and consents to input any personal data of your employees or
              customers into the Service.
            </p>
          </LegalSection>

          <LegalSection title="5. Acceptable Use">
            <p>You agree not to:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Use the Service for any unlawful purpose or in violation of applicable regulations.</li>
              <li>Attempt to gain unauthorized access to another tenant&rsquo;s data or to the Service&rsquo;s infrastructure.</li>
              <li>Reverse-engineer, decompile, or resell the Service without our written consent.</li>
              <li>Upload malicious code or interfere with the Service&rsquo;s normal operation.</li>
            </ul>
          </LegalSection>

          <LegalSection title="6. Kiosk Time-Tracking App">
            <p>
              The kiosk (tablet or mobile) time clock allows employees to
              clock in and out using a personal PIN issued by their employer.
              The Customer is responsible for informing employees that their
              attendance data is recorded and for obtaining any consent
              required under local employment law. See the{" "}
              <a href="/privacy/app/kiosk" className="underline underline-offset-2">
                Kiosk App Privacy Policy
              </a>{" "}
              for details on data collected by the app.
            </p>
          </LegalSection>

          <LegalSection title="7. Intellectual Property">
            <p>
              HABB One, its software, design, and documentation remain the
              exclusive property of HABB Global (Pvt) Ltd. These Terms grant
              you a limited, non-exclusive, non-transferable right to use the
              Service for your internal business operations during an active
              subscription. No other rights are granted.
            </p>
          </LegalSection>

          <LegalSection title="8. Service Availability">
            <p>
              We aim for high availability but do not guarantee uninterrupted
              access. Scheduled maintenance will be communicated in advance
              where reasonably possible. Enterprise plans may include a
              separately agreed service level agreement (SLA).
            </p>
          </LegalSection>

          <LegalSection title="9. Termination">
            <p>
              Either party may terminate a subscription as described in
              Section 3. We may suspend or terminate access immediately if
              you materially breach these Terms, including non-payment or
              violation of the Acceptable Use section. Upon termination, you
              may request an export of your Customer Data within 30 days,
              after which it may be deleted in accordance with our data
              retention practices.
            </p>
          </LegalSection>

          <LegalSection title="10. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, HABB Global shall not
              be liable for indirect, incidental, or consequential damages
              arising from use of the Service. Our total liability for any
              claim arising from these Terms is limited to the fees paid by
              the Customer in the three months preceding the claim.
            </p>
          </LegalSection>

          <LegalSection title="11. Changes to These Terms">
            <p>
              We may update these Terms from time to time. Material changes
              will be communicated by email or in-app notice at least 14 days
              before taking effect. Continued use of the Service after that
              date constitutes acceptance of the updated Terms.
            </p>
          </LegalSection>

          <LegalSection title="12. Contact">
            <p>
              Questions about these Terms can be sent to{" "}
              <a href="mailto:legal@habbglobal.com" className="underline underline-offset-2">
                legal@habbglobal.com
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
