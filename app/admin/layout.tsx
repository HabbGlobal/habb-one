import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionProvider } from "@/components/SessionProvider";
import { AdminShell } from "@/components/layout/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Pending- oder Rejected-Mandanten dürfen nicht in den normalen Admin-
  // Bereich. /onboarding lebt auf Top-Level (nicht /admin/onboarding), damit
  // wir hier hart redirecten können, ohne in eine Loop zu geraten.
  if (session.user.registrationStatus !== "ACTIVE") {
    redirect("/onboarding");
  }
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
