import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { TrustFooter } from "@/components/auth/TrustFooter";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";
import { getTenantFromRequest } from "@/lib/tenant/getTenant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    callbackUrl?: string;
    tenant?: string;
  }>;
}) {
  const t = await getTranslations("auth");
  const sp = await searchParams;
  const tenant = await getTenantFromRequest(sp.tenant);

  return (
    <main className="grid min-h-screen grid-cols-1 bg-white text-habb-ink lg:grid-cols-2">
      <BrandPanel tenant={tenant} />

      <section className="relative flex flex-col px-6 py-10 sm:px-10 lg:px-16 lg:py-12">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center pt-8 lg:pt-0">
          <header className="mb-8">
            <h2 className="text-2xl font-semibold tracking-[-0.01em] text-habb-black">
              {t("loginTitle")}
            </h2>
            <p className="mt-1.5 text-sm text-habb-muted">
              {t("loginSubtitle")}
            </p>
          </header>

          <AdminLoginForm
            callbackUrl={sp.callbackUrl}
            initialErrorParam={sp.error}
            labels={{
              email: t("emailLabel"),
              password: t("passwordLabel"),
              submit: t("loginButton"),
              failed: t("loginFailed"),
              forgotPassword: t("forgotPassword"),
              rememberMe: t("rememberMe"),
              showPassword: t("showPassword"),
              hidePassword: t("hidePassword"),
              capsLockOn: t("capsLockOn"),
            }}
          />

          <p className="mt-6 text-center text-sm text-habb-muted">
            No account yet?{" "}
            <Link
              href="/register"
              className="font-medium text-habb-ink underline-offset-2 hover:underline"
            >
              Request HABB One for your company
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-habb-muted">
            <Link
              href="/pricing"
              className="underline-offset-2 hover:text-habb-ink hover:underline"
            >
              View pricing and modules →
            </Link>
          </p>

          <TrustFooter />
        </div>
      </section>
    </main>
  );
}
