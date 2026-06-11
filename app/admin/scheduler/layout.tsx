import { requireModule } from "@/lib/entitlements/guard";

export default async function SchedulerModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireModule("WORKSHOP_PLAN");
  return <>{children}</>;
}
