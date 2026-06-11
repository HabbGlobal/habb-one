import { requireModule } from "@/lib/entitlements/guard";

export default async function TemplatesModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("ORDERS_QUOTES");
  return <>{children}</>;
}
