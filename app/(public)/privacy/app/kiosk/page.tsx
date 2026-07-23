import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/PublicHeader";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Kiosk App Privacy Policy — HABB One",
  description:
    "Privacy policy for the HABB One Kiosk Android/iOS app (com.habbgate.kiosk), used by employees to clock in and out with a PIN.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "July 24, 2026";
const CONTACT_EMAIL = "support@habbglobal.com";

export default function KioskAppPrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-habb-ink">
      <PublicHeader />

      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
          Legal · Mobile App
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-habb-black">
          Kiosk App Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-habb-muted">Last updated: {LAST_UPDATED}</p>
        <p className="mt-2 text-sm text-habb-muted">
          Applies to the app <strong>HABB One Kiosk</strong> (Android package{" "}
          <code className="rounded bg-habb-paper px-1 py-0.5 text-xs">
            com.habbgate.kiosk
          </code>
          , also distributed for iOS), published by HABB Global (Pvt) Ltd. For
          the web application and admin console, see the general{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-habb-ink">
          <LegalSection title="1. What the Kiosk App Is">
            <p>
              The HABB One Kiosk app turns a shared tablet or phone into a
              workshop time clock. Employees select their name from a grid and
              enter a personal 4-digit PIN issued by their employer to clock
              in, clock out, start or end a break, and view their own
              worked-hours and holiday balance. The app has no public sign-up:
              it is installed by a business customer (&ldquo;Employer&rdquo;) on a
              shared, company-owned device and only ever shows data for the
              employee currently authenticated by PIN.
            </p>
          </LegalSection>

          <LegalSection title="2. Data We Collect">
            <p>The app collects the following categories of data, all of which come from data your Employer already holds in HABB One — the app does not ask you to create a new account or profile:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Identity data:</strong> first name, last name, and
                employee number, shown in the employee-selection list and used
                to identify whose attendance is being recorded.
              </li>
              <li>
                <strong>Authentication data:</strong> the 4-digit PIN you
                enter. It is sent once, over an encrypted (HTTPS) connection,
                to verify your identity for that session. It is never stored
                on the device and never logged in readable form.
              </li>
              <li>
                <strong>Attendance / app activity data:</strong> clock-in,
                clock-out, break-start, and break-end events with their
                timestamps, plus the resulting worked hours, balances, and
                holiday/vacation totals shown back to you.
              </li>
              <li>
                <strong>App preferences (device-only):</strong> your light/dark
                theme choice is saved locally on the device using standard app
                storage. It is never transmitted to our servers or to anyone
                else.
              </li>
            </ul>
            <p>
              The app does <strong>not</strong> collect location, contacts,
              photos/media, camera or microphone input, call logs, or any
              advertising/device identifiers.
            </p>
          </LegalSection>

          <LegalSection title="3. How We Use This Data">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To verify which employee is clocking in/out on the shared device.</li>
              <li>To record attendance so it flows into your Employer&rsquo;s staff planning and payroll.</li>
              <li>To show you your own current status, worked hours, and holiday balance.</li>
              <li>To keep the kiosk session secure and correctly locked to your Employer&rsquo;s company data.</li>
            </ul>
            <p>We do not use this data for advertising, and we do not build behavioral profiles beyond the attendance records described above.</p>
          </LegalSection>

          <LegalSection title="4. Data Sharing and Third Parties">
            <p>
              We do not sell data and do not share it with advertisers or data
              brokers. The app contains no third-party analytics, advertising,
              or crash-tracking SDKs. Data is sent only to your Employer&rsquo;s
              HABB One backend (operated by HABB Global (Pvt) Ltd) and to the
              infrastructure providers (hosting and database) that run it
              under confidentiality obligations, solely to provide the
              Service.
            </p>
          </LegalSection>

          <LegalSection title="5. Data Security">
            <p>
              All traffic between the app and the backend is encrypted in
              transit (HTTPS/TLS). PINs are never cached or displayed back to
              the device. A kiosk session automatically ends after a short
              period of inactivity or when the employee taps back/logout, so
              the next person at the tablet cannot see a previous employee&rsquo;s
              data.
            </p>
          </LegalSection>

          <LegalSection title="6. Data Retention">
            <p>
              Attendance records are retained for as long as your Employer&rsquo;s
              HABB One subscription is active and your employee record exists,
              consistent with the retention terms in our general{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>
              . Your Employer controls when an employee record — and the
              attendance history tied to it — is removed.
            </p>
          </LegalSection>

          <LegalSection title="7. Your Rights and How to Delete Your Data">
            <p>
              The app has no separate sign-up, so there is no in-app
              &ldquo;delete my account&rdquo; button — your employee record lives in
              your Employer&rsquo;s HABB One tenant, and your Employer is the
              controller of that data.
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                To access, correct, or delete your attendance data, ask your
                Employer&rsquo;s HABB One administrator — they can update or
                remove your employee record directly.
              </li>
              <li>
                If you are unable to reach your Employer, or want to exercise
                a data-protection right directly with us, email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
                  {CONTACT_EMAIL}
                </a>{" "}
                with your name, employer/company name, and request. We will
                verify the request with your Employer and respond within 30
                days.
              </li>
              <li>
                Once an employee record is deleted by the Employer, the
                associated PIN stops working and the app can no longer
                retrieve attendance data for that person.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="8. Children's Privacy">
            <p>
              The Kiosk app is a workplace tool intended for use by employees
              of a business customer and is not directed at or knowingly used
              by children.
            </p>
          </LegalSection>

          <LegalSection title="9. Permissions Used by This App">
            <p>
              The app requests only network/internet access, needed to
              communicate with your Employer&rsquo;s HABB One backend. It does not
              request camera, precise or approximate location, contacts,
              photos/media/storage, microphone, SMS, call, or body-sensor
              permissions on Android or iOS.
            </p>
          </LegalSection>

          <LegalSection title="10. Changes to This Policy">
            <p>
              We may update this policy as the app changes. Material changes
              will be reflected on this page with an updated &ldquo;Last
              updated&rdquo; date above.
            </p>
          </LegalSection>

          <LegalSection title="11. Contact">
            <p>
              Developer: HABB Global (Pvt) Ltd. Questions about the Kiosk
              app&rsquo;s data practices, or a data request under Section 7, can be
              sent to{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2">
                {CONTACT_EMAIL}
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
