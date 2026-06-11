import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Landeseite für Mandanten, deren Registrierung noch nicht aktiv ist.
 * Wenn der User aktiv ist (Owner hat freigegeben), springt er von hier
 * sofort zurück ins normale Admin-Backend.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.registrationStatus === "ACTIVE") redirect("/admin");
  return <div className="min-h-screen bg-habb-paper text-habb-ink">{children}</div>;
}
