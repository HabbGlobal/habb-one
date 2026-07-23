import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-habb-line bg-habb-paper">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <FooterColumn title="Product">
            <FooterLink href="/#features">Features</FooterLink>
            <FooterLink href="/#time-tracking">Time Tracking</FooterLink>
            <FooterLink href="/pricing">Pricing</FooterLink>
          </FooterColumn>
          <FooterColumn title="Account">
            <FooterLink href="/register">Start Trial</FooterLink>
            <FooterLink href="/login">Login</FooterLink>
            <FooterLink href="/login">Customer Area</FooterLink>
          </FooterColumn>
          <FooterColumn title="Legal">
            <FooterLink href="/terms">Terms &amp; Conditions</FooterLink>
            <FooterLink href="/privacy">Privacy Policy</FooterLink>
            <FooterLink href="/privacy/app/kiosk">Kiosk App Privacy</FooterLink>
          </FooterColumn>
          <FooterColumn title="Company">
            <span className="text-habb-muted">HABB Global (Pvt) Ltd</span>
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-habb-line pt-6 text-xs text-habb-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} HABB One ERP — all rights reserved.</span>
          <span>Product by HABB Global (Pvt) Ltd</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-habb-ink">
        {title}
      </p>
      {children}
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-habb-muted hover:text-habb-ink">
      {children}
    </Link>
  );
}
