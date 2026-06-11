import { requireModule } from "@/lib/entitlements/guard";

export default async function ScheduleModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("STAFF_PLAN");
  return <>{children}</>;
}
