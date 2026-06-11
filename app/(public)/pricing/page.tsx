import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
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
  formatChf,
  type PlanSpec,
} from "@/lib/pricing/plans";
import type { TenantModule } from "@prisma/client";

export const metadata: Metadata = {
  title: "Preise — HABB One",
  description:
    "Transparente Preise für HABB One — die Schweizer ERP-Suite für Werkstätten. CRM, Aufträge, Rechnungen mit QR-Bill, Werkstatt-Plan und Personalabrechnung in einem.",
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
            Preise · Stand 2026
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-habb-black sm:text-5xl">
            Eine Software, fünf Stufen.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-habb-muted sm:text-lg">
            HABB One bringt CRM, Aufträge, Rechnungen mit QR-Bill, Werkstatt-Plan
            und Personalabrechnung in einer Schweizer Plattform zusammen. Klare
            Preise — Schweizer Hosting — kein Trick.
          </p>
          <p className="mt-3 text-xs text-habb-muted">
            Alle Preise inkl. {PRICING_VAT_RATE.toFixed(1)}% MWST · keine versteckten Gebühren ·
            jederzeit monatlich kündbar
          </p>
        </div>
      </section>

      {/* ─── Plan-Karten ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pt-10 pb-16">
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PLANS.map((plan) => (
            <PlanCard key={plan.key} plan={plan} />
          ))}
        </div>
      </section>

      {/* ─── Modul-Vergleichstabelle ───────────────────────────── */}
      <section className="bg-habb-paper border-y border-habb-line">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-habb-muted">
              Detail-Vergleich
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-habb-black">
              Was ist in welchem Plan dabei?
            </h2>
          </div>

          <div className="overflow-x-auto rounded-xl border border-habb-line bg-white shadow-sm">
            <table className="min-w-full divide-y divide-habb-line text-sm">
              <thead className="bg-habb-paper">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wide text-habb-muted">
                    Modul
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
                    Preis / Monat
                  </td>
                  {PLANS.map((plan) => (
                    <td key={plan.key} className="px-3 py-4 text-center">
                      <div className="font-semibold text-habb-ink">
                        {plan.priceCHF === null
                          ? "Auf Anfrage"
                          : plan.priceCHF === 0
                            ? "CHF 0"
                            : formatChf(plan.priceCHF)}
                      </div>
                      <div className="text-[10px] text-habb-muted">
                        {plan.priceCHF === null ? "individuelle Verträge" : "inkl. MWST"}
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
                        Wählen
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── Trust-Streifen ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <TrustItem
            icon={MapPin}
            title="Schweizer Hosting"
            text="Daten in Zürich (Supabase eu-central-2). DSG-konform, kein Drittland-Transfer."
          />
          <TrustItem
            icon={ShieldCheck}
            title="Audit + 2FA"
            text="Jede Aktion auditiert, Login mit OTP per E-Mail, Owner-Zugriff nur mit Consent."
          />
          <TrustItem
            icon={Headphones}
            title="Echter Support"
            text="Persönlich erreichbar — keine Chatbots. Mo–Fr 8–17 Uhr (CET)."
          />
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────── */}
      <section className="bg-habb-paper border-t border-habb-line">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-habb-black text-center">
            Häufige Fragen
          </h2>
          <div className="mt-10 space-y-6">
            <Faq q="Wie funktioniert die 14-tägige Trial-Phase?">
              Du registrierst dich, wir richten innerhalb von 24 Stunden deinen
              Mandanten ein. Trial schaltet alle Funktionen frei. Nach 14 Tagen
              wechselt der Plan automatisch auf <strong>Starter</strong> —
              vorher kannst du jederzeit upgraden oder kündigen, ohne Kosten.
            </Faq>
            <Faq q="Welche MWST ist enthalten?">
              Alle Preise auf dieser Seite verstehen sich inkl. der schweizerischen
              MWST von {PRICING_VAT_RATE.toFixed(1)}%. Geschäftskunden mit
              MwSt-Nummer erhalten eine Rechnung mit ausgewiesener MWST.
            </Faq>
            <Faq q="Kann ich später den Plan wechseln?">
              Ja, jederzeit. Upgrade ist sofort wirksam (nächste Abrechnung
              anteilig), Downgrade greift zum Ende der Vertragsperiode. Deine
              Daten bleiben in jedem Fall erhalten.
            </Faq>
            <Faq q="Wo werden die Daten gespeichert?">
              In Zürich (Schweiz), auf Supabase Postgres mit täglichen Backups.
              Wir geben keine Daten an Dritte weiter, der Owner-Zugriff im
              Support-Fall erfordert eine explizite Bestätigung per E-Mail-Code
              durch dich.
            </Faq>
            <Faq q="Was passiert mit der QR-Rechnung?">
              HABB One generiert den Schweizer QR-Zahlteil direkt im Rechnungs-PDF
              — kompatibel mit allen Schweizer Banken. Du brauchst nur deine
              QR-IBAN in den Firmen-Einstellungen.
            </Faq>
            <Faq q="Gibt es eine Integration mit Bexio, Abacus oder AbaNinja?">
              Ja, im Enterprise-Plan via API-Zugang. Wir synchronisieren Kunden
              und Rechnungen mit Bexio, Abacus und AbaNinja in beide Richtungen.
              Status-Webhooks gehen bei Auftragsänderungen raus.
            </Faq>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-habb-black sm:text-4xl">
          Bereit, deine Werkstatt zu digitalisieren?
        </h2>
        <p className="mt-3 text-base text-habb-muted">
          14 Tage kostenlos testen — Setup in 24 Stunden — keine Kreditkarte nötig.
        </p>
        <Link
          href="/register"
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-habb-black px-6 py-3 text-sm font-medium text-white hover:bg-habb-ink"
        >
          Trial starten <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-4 text-xs text-habb-muted">
          Schon Kunde?{" "}
          <Link href="/login" className="text-habb-ink underline-offset-2 hover:underline">
            Hier anmelden
          </Link>
        </p>
      </section>

      <PublicFooter />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Komponenten
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
          Beliebt
        </span>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-habb-muted">
        {plan.label}
      </h3>
      <div className="mt-3 flex items-baseline gap-1.5">
        {plan.priceCHF === null ? (
          // Enterprise: kein fester Listenpreis, individuelle Verträge
          <span className="text-3xl font-semibold tracking-tight text-habb-black">
            Auf Anfrage
          </span>
        ) : (
          <>
            <span className="text-sm font-medium text-habb-muted">CHF</span>
            <span className="text-4xl font-semibold tracking-tight text-habb-black tabular-nums">
              {plan.priceCHF}
            </span>
            <span className="text-sm text-habb-muted">/ Mt.</span>
          </>
        )}
      </div>
      {plan.priceNote ? (
        <p className="mt-1 text-xs text-habb-muted">{plan.priceNote}</p>
      ) : (
        <p className="mt-1 text-xs text-habb-muted">
          inkl. {PRICING_VAT_RATE.toFixed(1)}% MWST
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
          {plan.priceCHF === null
            ? "Anfragen"
            : plan.priceCHF === 0
              ? "Trial starten"
              : "Plan wählen"}
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

function PublicHeader() {
  return (
    <header className="border-b border-habb-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/habb-logo.png"
            alt="habb.ch"
            width={32}
            height={32}
            className="h-8 w-auto"
          />
          <span className="text-base font-semibold tracking-tight">
            habb<span className="text-habb-red">.ch</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/pricing" className="font-medium text-habb-ink">
            Preise
          </Link>
          <Link href="/login" className="text-habb-muted hover:text-habb-ink">
            Anmelden
          </Link>
          <Link
            href="/register"
            className="hidden sm:inline-flex items-center gap-1 rounded-md bg-habb-black px-3 py-1.5 text-xs font-medium text-white hover:bg-habb-ink"
          >
            Trial starten
          </Link>
        </nav>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-habb-line bg-habb-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-habb-muted">
        <span>© {new Date().getFullYear()} habb.ch — HABB One ERP</span>
        <span>Schweizer Hosting · Datenhaltung Zürich</span>
        <Link href="/login" className="hover:text-habb-ink">
          Kundenbereich
        </Link>
      </div>
    </footer>
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
