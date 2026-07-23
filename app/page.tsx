import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Users,
  FileText,
  Receipt,
  CalendarClock,
  UsersRound,
  Clock,
  ShieldCheck,
  MapPin,
  Headphones,
  Plug,
} from "lucide-react";
import { MODULES, PLANS, PRICING_VAT_RATE, formatUsd } from "@/lib/pricing/plans";
import { PublicHeader } from "@/components/marketing/PublicHeader";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "HABB One — ERP for Workshops",
  description:
    "HABB One brings CRM, orders, invoices with QR-Bill, workshop planning, staff planning and time tracking together in one platform. Starting at $29/month for time tracking alone.",
  robots: { index: true, follow: true },
};

const MODULE_ICONS = {
  CRM: Users,
  ORDERS_QUOTES: FileText,
  INVOICES_QR: Receipt,
  WORKSHOP_PLAN: CalendarClock,
  STAFF_PLAN: UsersRound,
  TIME_KIOSK: Clock,
} as const;

const timeOnlyPlan = PLANS.find((p) => p.key === "TIME_ONLY")!;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-habb-ink">
      <PublicHeader />

      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-habb-paper">
        <BackgroundGeometry />
        <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-14 text-center sm:pt-24">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
            ERP · Time Tracking · Payroll
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.02em] text-habb-black sm:text-5xl">
            One ERP for workshops — time clock, QR invoicing, and payroll in one place.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-habb-muted sm:text-lg">
            HABB One brings CRM, orders, invoices with QR-Bill, workshop plan
            and payroll together in a modern platform. Starting at{" "}
            {formatUsd(timeOnlyPlan.priceUSD!)}/month for time tracking alone.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-md bg-habb-black px-6 py-3 text-sm font-medium text-white hover:bg-habb-ink"
            >
              Start 14-Day Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md border border-habb-line bg-white px-6 py-3 text-sm font-medium text-habb-ink hover:bg-habb-paper"
            >
              See Pricing &amp; Plans
            </Link>
          </div>
          <p className="mt-4 text-xs text-habb-muted">
            No credit card required · Cancel monthly at any time · GDPR-compliant hosting
          </p>
        </div>
      </section>

      {/* ─── Modules ────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16 scroll-mt-20">
        <div className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
            Integrated Workshop System
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-habb-black">
            Everything your workshop runs on, in one system.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(MODULE_ICONS) as (keyof typeof MODULE_ICONS)[]).map((key) => {
            const m = MODULES[key];
            const Icon = MODULE_ICONS[key];
            return (
              <div
                key={key}
                className="rounded-xl border border-habb-line bg-white p-6 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-habb-paper">
                  <Icon className="h-5 w-5 text-habb-ink" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-habb-ink">
                  {m.label}
                </h3>
                <p className="mt-1.5 text-sm text-habb-muted">
                  {m.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Time Tracking Only ────────────────────────────────── */}
      <section
        id="time-tracking"
        className="bg-habb-paper border-y border-habb-line scroll-mt-20"
      >
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
                Just Time Tracking
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-habb-black">
                Only need a time clock? Start at{" "}
                {formatUsd(timeOnlyPlan.priceUSD!)}/month.
              </h2>
              <p className="mt-3 text-base text-habb-muted">
                {timeOnlyPlan.tagline}
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                {timeOnlyPlan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-habb-ink">
                    <Check className="h-4 w-4 shrink-0 text-habb-success mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/register?plan=TIME_ONLY"
                className="mt-8 inline-flex items-center gap-2 rounded-md bg-habb-black px-5 py-2.5 text-sm font-medium text-white hover:bg-habb-ink"
              >
                Start Time Tracking <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-xl border border-habb-line bg-white p-8 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-habb-muted">
                {timeOnlyPlan.label}
              </p>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-sm font-medium text-habb-muted">$</span>
                <span className="text-4xl font-semibold tracking-tight text-habb-black tabular-nums">
                  {timeOnlyPlan.priceUSD}
                </span>
                <span className="text-sm text-habb-muted">/ mo</span>
              </div>
              <p className="mt-1 text-xs text-habb-muted">
                incl. {PRICING_VAT_RATE.toFixed(1)}% VAT
              </p>
              <p className="mt-4 text-sm text-habb-ink">
                A single tablet becomes your workshop time clock — employees
                clock in with their own 4-digit PIN, no app install, no
                individual login.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Differentiators ───────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
            Built for Growing Workshops
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-habb-black">
            Secure, transparent, and personally supported.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <TrustItem
            icon={MapPin}
            title="Secure Hosting"
            text="Data is stored securely. GDPR-compliant, no third-country transfers."
          />
          <TrustItem
            icon={ShieldCheck}
            title="Audit + 2FA"
            text="Every action audited, login with OTP via email, owner access only with consent."
          />
          <TrustItem
            icon={Clock}
            title="Built-in Time Clock"
            text="PIN-based tablet time clock, live balances, breaks, and holiday status included."
          />
          <TrustItem
            icon={Receipt}
            title="QR-Bill Invoicing"
            text="Payment part generated directly in the invoice PDF — compatible with major banks."
          />
          <TrustItem
            icon={Headphones}
            title="Real Support"
            text="Personally available — no chatbots. Mon–Fri 8am–5pm (CET)."
          />
          <TrustItem
            icon={Plug}
            title="API Integrations"
            text="Two-way sync with Bexio, Abacus, and AbaNinja on the Enterprise plan."
          />
        </div>
      </section>

      {/* ─── Pricing Teaser ─────────────────────────────────────── */}
      <section className="bg-habb-paper border-t border-habb-line">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
              Pricing
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-habb-black">
              One software, five levels.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-habb-muted">
              Clear pricing, all prices incl. {PRICING_VAT_RATE.toFixed(1)}% VAT — no hidden fees.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={
                  plan.featured
                    ? "rounded-xl border-2 border-habb-black bg-white p-5 text-center"
                    : "rounded-xl border border-habb-line bg-white p-5 text-center"
                }
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-habb-muted">
                  {plan.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-habb-black tabular-nums">
                  {plan.priceUSD === null
                    ? "Custom"
                    : plan.priceUSD === 0
                      ? "Free"
                      : formatUsd(plan.priceUSD)}
                </p>
                {plan.priceUSD !== null && plan.priceUSD > 0 && (
                  <p className="text-[10px] text-habb-muted">/ month</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-md bg-habb-black px-5 py-2.5 text-sm font-medium text-white hover:bg-habb-ink"
            >
              See Full Pricing &amp; Module Comparison <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight text-habb-black text-center">
          Frequently Asked Questions
        </h2>
        <div className="mt-10 space-y-6">
          <Faq q="What is HABB One?">
            HABB One is a modular ERP for SME workshops — combining CRM, order
            and quote processing, invoicing with QR-Bill, workshop planning,
            staff planning, and a tablet-based time clock in one platform.
          </Faq>
          <Faq q="Can I use only time tracking?">
            Yes. The Time Tracking plan gives you the PIN-based tablet time
            clock, live balances, breaks, and monthly payroll exports without
            the rest of the ERP — starting at {formatUsd(timeOnlyPlan.priceUSD!)}/month.
          </Faq>
          <Faq q="Where is the data stored?">
            On secure servers with daily backups. We do not share data with
            third parties; owner access for support requires explicit
            confirmation via an email code from you.
          </Faq>
          <Faq q="How does the 14-day trial phase work?">
            You register, and we set up your tenant within 24 hours. The trial
            unlocks all features. After 14 days, the plan automatically
            switches to Starter — you can upgrade or cancel at any time
            beforehand, free of charge.
          </Faq>
          <Faq q="Is there an integration with Bexio, Abacus, or AbaNinja?">
            Yes, in the Enterprise plan via API access. We synchronize
            customers and invoices with Bexio, Abacus, and AbaNinja in both
            directions.
          </Faq>
        </div>
      </section>

      {/* ─── Final CTA ─────────────────────────────────────────── */}
      <section className="border-t border-habb-line bg-habb-paper">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-habb-black sm:text-4xl">
            Ready to digitize your workshop?
          </h2>
          <p className="mt-3 text-base text-habb-muted">
            Try for 14 days free — Setup in 24 hours — no credit card required.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-habb-black px-6 py-3 text-sm font-medium text-white hover:bg-habb-ink"
          >
            Start Trial <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-4 text-xs text-habb-muted">
            Already a customer?{" "}
            <Link href="/login" className="text-habb-ink underline-offset-2 hover:underline">
              Login here
            </Link>
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

function TrustItem({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-habb-line bg-white p-5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-habb-paper">
        <Icon className="h-4 w-4 text-habb-ink" />
      </span>
      <div>
        <p className="text-sm font-semibold text-habb-ink">{title}</p>
        <p className="mt-1 text-sm text-habb-muted">{text}</p>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border border-habb-line bg-white px-5 py-4 open:shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between text-sm font-medium text-habb-ink list-none">
        {q}
        <span className="ml-4 text-habb-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 text-sm text-habb-muted leading-relaxed">{children}</div>
    </details>
  );
}

function BackgroundGeometry() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <span className="absolute -top-20 -left-12 h-72 w-72 rounded-full bg-white opacity-50" />
      <span className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-white opacity-50" />
      <span className="absolute top-20 right-20 h-2 w-12 rounded-full bg-habb-red/60" />
    </div>
  );
}
