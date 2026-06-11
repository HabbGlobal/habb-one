import { requireModule } from "@/lib/entitlements/guard";

export default async function AttendanceModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gleicher Modul-Gate wie /admin/time-entries — die Anwesenheit ist die
  // Admin-Sicht auf die TIME_KIOSK-Daten.
  await requireModule("TIME_KIOSK");
  return <>{children}</>;
}
