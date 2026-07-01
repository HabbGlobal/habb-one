import { requireModule } from "@/lib/entitlements/guard";

export default async function AttendanceModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Same module gate as /admin/time-entries — Attendance is the
// administrative view of the TIME_KIOSK data.
  await requireModule("TIME_KIOSK");
  return <>{children}</>;
}
