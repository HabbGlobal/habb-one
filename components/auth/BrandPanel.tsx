import Image from "next/image";
import { Cloud, Cog, Code2, Brain } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { TenantContext } from "@/lib/tenant/getTenant";

interface BrandPanelProps {
  tenant: TenantContext | null;
}

export async function BrandPanel({ tenant }: BrandPanelProps) {
  const t = await getTranslations("auth");
  const features = [
    { icon: Cloud, label: t("feature1") },
    { icon: Cog, label: t("feature2") },
    { icon: Code2, label: t("feature3") },
    { icon: Brain, label: t("feature4") },
  ];

  return (
    <aside className="relative flex flex-col gap-8 bg-habb-paper px-6 py-8 sm:px-10 sm:py-10 lg:min-h-screen lg:justify-between lg:gap-0 lg:px-16 lg:py-12">
      <BackgroundGeometry />

      <div className="relative z-10 flex items-center gap-3">
        <Image
          src="/brand/habb-logo.png"
          alt="habb.ch – Anbieter von HABB One"
          width={48}
          height={48}
          priority
          sizes="(max-width: 768px) 40px, 48px"
          className="h-10 w-auto lg:h-12"
        />
        <span className="text-sm font-medium tracking-tight text-habb-muted">
          habb<span className="text-habb-red">.ch</span>
        </span>
      </div>

      <div className="relative z-10 max-w-md lg:mt-0">
        {tenant ? (
          <p className="mb-3 text-xs text-habb-muted">
            {t("tenantLabel")}:{" "}
            <span className="font-medium text-habb-ink">{tenant.name}</span>
          </p>
        ) : null}

        <h1 className="font-semibold tracking-[-0.02em] text-habb-black text-4xl leading-tight lg:text-5xl">
          HABB One
        </h1>
        <p className="mt-4 text-base text-habb-muted lg:text-lg">
          {t("brandSubline")}
        </p>

        <ul className="mt-10 hidden space-y-4 lg:block">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-start gap-3 text-sm text-habb-ink">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-habb-line bg-white">
                <Icon className="h-4 w-4 text-habb-black" aria-hidden="true" />
              </span>
              <span className="leading-7">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-10 mt-12 hidden items-center gap-3 text-xs text-habb-muted lg:mt-0 lg:flex">
        <SwissCrossDetail title={t("swissCrossTooltip")} />
        <span>
          {t("providerLine")} ·{" "}
          {t("copyright", { year: new Date().getFullYear() })}
        </span>
      </div>
    </aside>
  );
}

function SwissCrossDetail({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="grid h-8 w-8 place-items-center rounded-sm bg-habb-red text-white"
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-5 w-5" role="presentation">
        <rect x="13" y="6" width="6" height="20" fill="currentColor" />
        <rect x="6" y="13" width="20" height="6" fill="currentColor" />
      </svg>
    </span>
  );
}

function BackgroundGeometry() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <span className="absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-[#F2F1EF] opacity-60" />
      <span className="absolute -bottom-24 left-32 h-64 w-64 rounded-full bg-[#F2F1EF] opacity-50" />
      <span className="absolute bottom-12 left-1/2 h-44 w-44 rounded-full bg-[#F2F1EF] opacity-40" />
      <span className="absolute -bottom-10 right-0 h-52 w-52 rounded-full bg-[#F2F1EF] opacity-50" />
    </div>
  );
}
