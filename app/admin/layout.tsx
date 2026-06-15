import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionProvider } from "@/components/SessionProvider";
import { AdminShell } from "@/components/layout/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Pending or rejected tenants must not enter the normal admin
  // area. /onboarding lives at top level (not /admin/onboarding), so
  // we can hard redirect here without getting into a loop.
  if (session.user.registrationStatus !== "ACTIVE") {
    redirect("/onboarding");
  }
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
