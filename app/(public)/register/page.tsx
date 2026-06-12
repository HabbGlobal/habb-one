import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./RegisterForm";
import { PLANS, type PlanKey, formatUsd } from "@/lib/pricing/plans";

export const metadata: Metadata = {
  title: "Register — HABB One",
  description: "Create a HABB One account for your workshop. Manual approval by the HABB Global (PVT) LTD team will follow.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const sp = await searchParams;
  const selectedPlan = PLANS.find((p) => p.key === sp.plan);

  return (
    <main className="grid min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <header>
          <Link href="/" className="text-sm font-semibold tracking-tight">
            HABB One
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-habb-black sm:text-3xl">
            Create a HABB One account
          </h1>
          <p className="mt-2 text-sm text-habb-muted">
            Your details will be reviewed, after which we will manually grant access. Registration is free and you are not committing to anything.
          </p>
        </header>

        {selectedPlan && (
          <section className="mt-6 rounded-lg border border-habb-line bg-habb-paper px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-habb-muted">
                  Selected Plan
                </p>
                <div className="text-sm text-habb-muted">
                  {selectedPlan.priceUSD === null
                    ? "Custom contracts"
                    : selectedPlan.priceUSD === 0
                      ? "14 days free"
                      : `${formatUsd(selectedPlan.priceUSD)} / month incl. VAT`}
                </div>
                <p className="mt-0.5 text-xs text-habb-muted">{selectedPlan.tagline}</p>
              </div>
              <Link
                href="/pricing"
                className="text-xs text-habb-ink underline-offset-2 hover:underline whitespace-nowrap"
              >
                Change plan →
              </Link>
            </div>
          </section>
        )}

        <div className="mt-10">
          <RegisterForm plan={selectedPlan?.key} />
        </div>

        <p className="mt-10 border-t border-habb-line pt-6 text-center text-sm text-habb-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-habb-ink underline-offset-2 hover:underline">
            Sign in
          </Link>
          <span className="mx-2">·</span>
          <Link href="/pricing" className="hover:text-habb-ink hover:underline">
            Pricing
          </Link>
        </p>
      </div>
    </main>
  );
}
