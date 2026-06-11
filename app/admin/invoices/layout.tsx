import { requireModule } from "@/lib/entitlements/guard";

export default async function InvoicesModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("INVOICES_QR");
  return <>{children}</>;
}
