import { requireModule } from "@/lib/entitlements/guard";

export default async function QuotesModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("ORDERS_QUOTES");
  return <>{children}</>;
}
