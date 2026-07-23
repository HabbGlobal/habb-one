import type { Metadata } from "next";
import Link from "next/link";
import {
  Check,
  X,
  Sparkles,
  ShieldCheck,
  MapPin,
  Headphones,
  ArrowRight,
} from "lucide-react";
import {
  MODULES,
  PLANS,
  PRICING_VAT_RATE,
  formatUsd,
  type PlanSpec,
} from "@/lib/pricing/plans";
import type { TenantModule } from "@prisma/client";
import { PublicHeader } from "@/components/marketing/PublicHeader";
import { PublicFooter } from "@/components/marketing/PublicFooter";

export const metadata: Metadata = {
  title: "Pricing — HABB One",
  description:
    "Transparent pricing for HABB One — the ERP suite for workshops. CRM, orders, invoices with QR-Bill, workshop plan, and payroll in one.",
  robots: { index: true, follow: true },
};

const ALL_MODULES = Object.keys(MODULES) as TenantModule[];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-habb-ink">
      <PublicHeader />

      {/* ─── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-habb-paper">
        <BackgroundGeometry />
        <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-12 text-center sm:pt-24">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
            Pricing · As of 2026
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-habb-black sm:text-5xl">
            One software, five levels.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-habb-muted sm:text-lg">
            HABB One brings CRM, orders, invoices with QR-Bill, workshop plan
            and payroll together in a modern platform. Clear pricing — secure hosting — no tricks.
          </p>
          <p className="mt-3 text-xs text-habb-muted">
            All prices incl. {PRICING_VAT_RATE.toFixed(1)}% VAT · no hidden fees ·
            cancelable monthly at any time
          </p>
        </div>
      </section>

      {/* ─── Plan Cards ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-16">
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PLANS.map((plan) => (
            <PlanCard key={plan.key} plan={plan} />
          ))}
        </div>
      </section>

      {/* ─── Module Comparison Table ───────────────────────────── */}
      <section className="bg-habb-paper border-y border-habb-line">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
              Detailed Comparison
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-habb-black">
              What is included in each plan?
            </h2>
          </div>

          <div className="overflow-x-auto rounded-xl border border-habb-line bg-white shadow-sm">
            <table className="min-w-full divide-y divide-habb-line text-sm">
              <thead className="bg-habb-paper">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-habb-muted">
                    Module
                  </th>
                  {PLANS.map((p) => (
                    <th
                      key={p.key}
                      className="px-3 py-4 text-center text-xs font-semibold uppercase tracking-wide text-habb-muted"
                    >
                      {p.label}
                      {p.featured && (
                        <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-habb-red" />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-habb-line">
                {ALL_MODULES.map((moduleKey) => {
                  const m = MODULES[moduleKey];
                  return (
                    <tr key={moduleKey} className="hover:bg-habb-paper/40">
                      <td className="px-5 py-4">
                        <div className="font-medium text-habb-ink">{m.label}</div>
                        <div className="mt-0.5 text-xs text-habb-muted">
                          {m.description}
                        </div>
                      </td>
                      {PLANS.map((plan) => (
                        <td key={plan.key} className="px-3 py-4 text-center">
                          {plan.modules.includes(moduleKey) ? (
                            <Check className="mx-auto h-4 w-4 text-habb-success" />
                          ) : (
                            <X className="mx-auto h-4 w-4 text-habb-line" />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="bg-habb-paper/60">
                  <td className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-habb-muted">
                    Limits + Support
                  </td>
                  {PLANS.map((plan) => (
                    <td key={plan.key} className="px-3 py-4 text-center text-xs">
                      <ul className="space-y-1">
                        {plan.limits.map((l) => (
                          <li key={l.label}>
                            <span className="text-habb-muted">{l.label}:</span>{" "}
                            <span className="font-medium text-habb-ink">{l.value}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-4 text-xs font-semibold uppercase tracking-wide text-habb-muted">
                    Price / Month
                  </td>
                  {PLANS.map((plan) => (
                    <td key={plan.key} className="px-3 py-4 text-center">
                      <div className="font-semibold text-habb-ink">
                        {plan.priceUSD === null
                          ? "On request"
                          : plan.priceUSD === 0
                            ? "$0"
                            : formatUsd(plan.priceUSD)}
                      </div>
                      <div className="text-[10px] text-habb-muted">
                        {plan.priceUSD === null ? "custom contracts" : "incl. VAT"}
                      </div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-4"></td>
                  {PLANS.map((plan) => (
                    <td key={plan.key} className="px-3 py-4 text-center">
                      <Link
                        href={`/register?plan=${plan.key}`}
                        className={
                          plan.featured
                            ? "inline-flex items-center gap-1 rounded-md bg-habb-black px-3 py-1.5 text-xs font-medium text-white hover:bg-habb-ink"
                            : "inline-flex items-center gap-1 rounded-md border border-habb-line bg-white px-3 py-1.5 text-xs font-medium text-habb-ink hover:bg-habb-paper"
                        }
                      >
                        Select
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── Trust Section ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
            icon={Headphones}
            title="Real Support"
            text="Personally available — no chatbots. Mon–Fri 8am–5pm (CET)."
          />
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────── */}
      <section className="bg-habb-paper border-t border-habb-line">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-habb-black text-center">
            Frequently Asked Questions
          </h2>
          <div className="mt-10 space-y-6">
            <Faq q="How does the 14-day trial phase work?">
              You register, and we set up your tenant within 24 hours. The trial
              unlocks all features. After 14 days, the plan automatically switches
              to <strong>Starter</strong> — you can upgrade or cancel at any time beforehand, free of charge.
            </Faq>
            <Faq q="What VAT is included?">
              All prices on this page include the VAT of {PRICING_VAT_RATE.toFixed(1)}%.
              Business customers with a VAT number receive an invoice with VAT stated.
            </Faq>
            <Faq q="Can I change my plan later?">
              Yes, at any time. Upgrades are effective immediately (prorated on the next bill),
              downgrades take effect at the end of the contract period. Your data is preserved in any case.
            </Faq>
            <Faq q="Where is the data stored?">
              On secure servers with daily backups.
              We do not share data with third parties; owner access for support
              requires explicit confirmation via an email code from you.
            </Faq>
            <Faq q="What about the QR bill?">
              HABB One generates the QR payment part directly in the invoice PDF
              — compatible with all major banks. You only need your QR-IBAN in the company settings.
            </Faq>
            <Faq q="Is there an integration with Bexio, Abacus, or AbaNinja?">
              Yes, in the Enterprise plan via API access. We synchronize customers
              and invoices with Bexio, Abacus, and AbaNinja in both directions.
              Status webhooks go out upon order changes.
            </Faq>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
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
      </section>

      <PublicFooter />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

function PlanCard({ plan }: { plan: PlanSpec }) {
  return (
    <div
      className={
        plan.featured
          ? "relative flex flex-col rounded-xl border-2 border-habb-black bg-white p-6 shadow-lg"
          : "relative flex flex-col rounded-xl border border-habb-line bg-white p-6 shadow-sm"
      }
    >
      {plan.featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-habb-black px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
          <Sparkles className="h-3 w-3" />
          Popular
        </span>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-habb-muted">
        {plan.label}
      </h3>
      <div className="mt-3 flex items-baseline gap-1.5">
        {plan.priceUSD === null ? (
          // Enterprise: no fixed list price, custom contracts
          <span className="text-3xl font-semibold tracking-tight text-habb-black">
            On Request
          </span>
        ) : (
          <>
            <span className="text-sm font-medium text-habb-muted">$</span>
            <span className="text-4xl font-semibold tracking-tight text-habb-black tabular-nums">
              {plan.priceUSD}
            </span>
            <span className="text-sm text-habb-muted">/ mo</span>
          </>
        )}
      </div>
      {plan.priceNote ? (
        <p className="mt-1 text-xs text-habb-muted">{plan.priceNote}</p>
      ) : (
        <p className="mt-1 text-xs text-habb-muted">
          incl. {PRICING_VAT_RATE.toFixed(1)}% VAT
        </p>
      )}

      <p className="mt-4 text-sm text-habb-ink">{plan.tagline}</p>

      <ul className="mt-5 space-y-2 text-sm">
        {plan.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-habb-ink">
            <Check className="h-4 w-4 shrink-0 text-habb-success mt-0.5" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 pt-5 border-t border-habb-line flex-1 flex flex-col justify-end">
        <Link
          href={`/register?plan=${plan.key}`}
          className={
            plan.featured
              ? "inline-flex w-full items-center justify-center gap-2 rounded-md bg-habb-black px-4 py-2.5 text-sm font-medium text-white hover:bg-habb-ink"
              : "inline-flex w-full items-center justify-center gap-2 rounded-md border border-habb-line bg-white px-4 py-2.5 text-sm font-medium text-habb-ink hover:bg-habb-paper"
          }
        >
          {plan.priceUSD === null
            ? "Request"
            : plan.priceUSD === 0
              ? "Start Trial"
              : "Select Plan"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
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
    <div className="flex items-start gap-3">
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
