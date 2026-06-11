import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./RegisterForm";
import { PLANS, formatChf } from "@/lib/pricing/plans";

export const metadata: Metadata = {
  title: "Registrieren — HABB One",
  description: "Eröffnen Sie ein HABB One-Konto für Ihre Werkstatt. Freigabe durch das habb.ch Team folgt manuell.",
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
            habb<span className="text-habb-red">.ch</span>
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-habb-black sm:text-3xl">
            HABB One-Konto anlegen
          </h1>
          <p className="mt-2 text-sm text-habb-muted">
            Ihre Daten werden geprüft, danach geben wir den Zugang manuell frei. Die Eröffnung
            kostet nichts und Sie verpflichten sich zu nichts.
          </p>
        </header>

        {selectedPlan && (
          <section className="mt-6 rounded-lg border border-habb-line bg-habb-paper px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-habb-muted">
                  Gewählter Plan
                </p>
                <p className="mt-0.5 text-sm font-semibold text-habb-ink">
                  {selectedPlan.label} —{" "}
                  {selectedPlan.priceCHF === null
                    ? "Auf Anfrage (individueller Vertrag)"
                    : selectedPlan.priceCHF === 0
                      ? "14 Tage gratis"
                      : `${formatChf(selectedPlan.priceCHF)} / Monat inkl. MWST`}
                </p>
                <p className="mt-0.5 text-xs text-habb-muted">{selectedPlan.tagline}</p>
              </div>
              <Link
                href="/pricing"
                className="text-xs text-habb-ink underline-offset-2 hover:underline whitespace-nowrap"
              >
                Plan ändern →
              </Link>
            </div>
          </section>
        )}

        <div className="mt-10">
          <RegisterForm plan={selectedPlan?.key} />
        </div>

        <p className="mt-10 border-t border-habb-line pt-6 text-center text-sm text-habb-muted">
          Schon ein Konto?{" "}
          <Link href="/login" className="text-habb-ink underline-offset-2 hover:underline">
            Anmelden
          </Link>
          <span className="mx-2">·</span>
          <Link href="/pricing" className="hover:text-habb-ink hover:underline">
            Preise
          </Link>
        </p>
      </div>
    </main>
  );
}
