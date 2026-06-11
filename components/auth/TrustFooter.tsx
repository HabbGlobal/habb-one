import { getTranslations } from "next-intl/server";

export async function TrustFooter() {
  const t = await getTranslations("auth");
  return (
    <p className="mt-10 text-center text-xs text-habb-muted">
      {t("trustHosted")}
      <span aria-hidden="true" className="mx-1.5 text-habb-red">
        ·
      </span>
      {t("trustCompliance")}
      <span aria-hidden="true" className="mx-1.5 text-habb-red">
        ·
      </span>
      {t("trustEncryption")}
    </p>
  );
}
