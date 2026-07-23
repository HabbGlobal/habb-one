import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/PublicHeader";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Kiosk App Privacy Policy — HABB One",
  description: "Privacy policy for the HABB One Kiosk mobile app, used by employees to clock in and out with a PIN.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "July 24, 2026";

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
          This policy covers the <strong>HABB One Kiosk</strong> mobile app
          only. For the web application and admin console, see the general{" "}
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
              worked-hours and holiday balance. The app does not require a
              per-employee account, app-store login, or personal device — it
              is designed to be used on a shared, company-owned device.
            </p>
          </LegalSection>

          <LegalSection title="2. Information the App Accesses">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Employee selection and PIN:</strong> the employee&rsquo;s
                name, employee number, and the 4-digit PIN entered at the
                device are sent to your company&rsquo;s HABB One backend to verify
                identity. The PIN is transmitted over an encrypted connection
                and is never stored on the device.
              </li>
              <li>
                <strong>Attendance actions:</strong> clock-in, clock-out,
                break-start, and break-end events, each with a timestamp, are
                sent to the backend and associated with the employee&rsquo;s
                record.
              </li>
              <li>
                <strong>Status display:</strong> the app fetches and displays
                today&rsquo;s and this week&rsquo;s worked time, target hours, balance,
                and remaining vacation days — all read from your company&rsquo;s
                existing HABB One data, shown only for the currently
                PIN-authenticated employee during their session.
              </li>
              <li>
                <strong>Company/tenant selection:</strong> the app may store a
                company identifier and a short-lived kiosk lock/session
                cookie locally on the device so it knows which company&rsquo;s
                employee list to show and to avoid the kiosk lock screen
                during a shift.
              </li>
            </ul>
          </LegalSection>

          <LegalSection title="3. What the App Does Not Do">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>No access to contacts, camera, microphone, photos, or precise location.</li>
              <li>No advertising SDKs, ad tracking, or sale of data to third parties.</li>
              <li>No analytics profiling of individual employees beyond the attendance records described above.</li>
              <li>No data collected from anyone other than the employee actively using the kiosk at the time.</li>
            </ul>
          </LegalSection>

          <LegalSection title="4. Who Controls the Data">
            <p>
              Your employer (the company operating the kiosk) is the data
              controller for all attendance and PIN data — HABB Global (Pvt)
              Ltd processes it solely on the employer&rsquo;s behalf as described in
              our{" "}
              <Link href="/terms" className="underline underline-offset-2">
                Terms &amp; Conditions
              </Link>
              . Requests to access, correct, or delete your attendance data
              should go to your employer, who manages your employee record in
              HABB One.
            </p>
          </LegalSection>

          <LegalSection title="5. Data Storage and Security">
            <p>
              Attendance data entered through the app is stored on the same
              secure servers used by the HABB One web application, described
              in the general{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>
              . All requests between the app and the backend are encrypted in
              transit. A kiosk session automatically expires after a short
              period of inactivity, and PINs are never cached or displayed
              back to the device.
            </p>
          </LegalSection>

          <LegalSection title="6. Permissions">
            <p>
              The app requests network access to communicate with your
              company&rsquo;s HABB One backend. It does not request camera,
              location, contacts, storage, or microphone permissions on
              Android or iOS.
            </p>
          </LegalSection>

          <LegalSection title="7. Children's Privacy">
            <p>
              The Kiosk app is intended for use by employees of a business
              customer and is not directed at children.
            </p>
          </LegalSection>

          <LegalSection title="8. Changes to This Policy">
            <p>
              We may update this policy as the app changes. Material changes
              will be reflected on this page with an updated date above.
            </p>
          </LegalSection>

          <LegalSection title="9. Contact">
            <p>
              Questions about the Kiosk app&rsquo;s data practices can be sent to{" "}
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
