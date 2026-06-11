import { requireModule } from "@/lib/entitlements/guard";

export default async function TimeEntriesModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("TIME_KIOSK");
  return <>{children}</>;
}
