import { ShieldCheck, KeySquare, FileSearch, MapPin } from "lucide-react";

interface AuthShellProps {
  currentStep: 1 | 2;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const STEPS: { n: 1 | 2; label: string }[] = [
  { n: 1, label: "Email" },
  { n: 2, label: "Passkey" },
];

const TRUST_BULLETS = [
  { icon: KeySquare, label: "WebAuthn / Passkey required for every login" },
  { icon: FileSearch, label: "Every action is audited — append-only" },
  { icon: MapPin, label: "Data stored in the EU (Zurich region)" },
  { icon: ShieldCheck, label: "Strictly separated from customer login" },
];

export function OwnerAuthShell({ currentStep, title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-[calc(100vh-1.5rem)] flex-col lg:flex-row">
      {/* Compact mobile/tablet header */}
      <header className="flex items-center gap-3 bg-habb-ink px-6 py-5 text-white lg:hidden">
        <Wordmark size="sm" />
        <span className="ml-auto text-[11px] uppercase tracking-[0.18em] text-white/60">
          Owner Console
        </span>
      </header>

      {/* Desktop brand panel */}
      <aside className="relative hidden bg-habb-ink px-12 py-14 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
        <BackgroundGeometry />
        <div className="relative z-10">
          <Wordmark size="lg" />
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/50">
            Owner Console
          </p>
          <h2 className="mt-12 text-4xl font-semibold tracking-[-0.02em]">
            Operational access for SaaS operators
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">
            Console for HABB Global (PVT) LTD — tenant management, permissions, audit trail, and
            customer consent impersonation for support cases.
          </p>
          <ul className="mt-10 space-y-3.5">
            {TRUST_BULLETS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-3 text-sm text-white/85">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10">
                  <Icon className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                </span>
                <span className="leading-7">{label}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/40">
          This page is not intended for customers. Customer login can be found
          under <span className="text-white/60">/login</span>.
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-10 lg:px-12">
        <div className="w-full max-w-md">
          <Stepper current={currentStep} />
          <h1 className="mt-7 text-2xl font-semibold tracking-tight text-habb-black sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-habb-muted sm:text-base">{subtitle}</p>
          ) : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

function Stepper({ current }: { current: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Anmeldefortschritt">
      {STEPS.map((step, idx) => {
        const active = current === step.n;
        const done = step.n < current;
        return (
          <li key={step.n} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-tight",
                active
                  ? "bg-habb-black text-white"
                  : done
                    ? "bg-habb-black/90 text-white"
                    : "border border-habb-line bg-white text-habb-muted",
              ].join(" ")}
            >
              {step.n}
            </span>
            <span
              className={
                active
                  ? "text-xs font-medium text-habb-ink sm:text-sm"
                  : "text-xs text-habb-muted sm:text-sm"
              }
            >
              {step.label}
            </span>
            {idx === 0 ? (
              <span aria-hidden="true" className="ml-1 h-px flex-1 bg-habb-line" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Wordmark({ size }: { size: "sm" | "lg" }) {
  const cls = size === "lg" ? "text-xl" : "text-base";
  return (
    <span className={`font-semibold tracking-tight ${cls}`}>
      habb<span className="text-habb-red">.ch</span>
    </span>
  );
}

function BackgroundGeometry() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.03]" />
      <span className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-white/[0.02]" />
      <span className="absolute -right-12 bottom-24 h-2 w-12 rounded-full bg-habb-red/80" />
    </div>
  );
}
