import { requireModule } from "@/lib/entitlements/guard";

export default async function CustomersModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("CRM");
  return <>{children}</>;
}
