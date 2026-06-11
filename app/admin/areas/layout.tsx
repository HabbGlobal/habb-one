import { requireModule } from "@/lib/entitlements/guard";

export default async function AreasModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("WORKSHOP_PLAN");
  return <>{children}</>;
}
