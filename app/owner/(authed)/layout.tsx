import { redirect } from "next/navigation";
import { getOwnerContext } from "@/lib/owner/auth";
import { OwnerSidebar } from "@/components/owner/Sidebar";
import { OwnerLogoutButton } from "@/components/owner/OwnerLogoutButton";

export const dynamic = "force-dynamic";

/**
 * Geschütztes Owner-Layout. Sitzt unter dem äusseren `app/owner/layout.tsx`
 * und ist nur für alle Routen unterhalb `(authed)/*` aktiv. Login- und
 * Enrollment-Routen sind bewusst NICHT in dieser Gruppe → kein Auth-Check.
 */
export default async function AuthedOwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getOwnerContext();
  if (!ctx) {
    redirect("/owner/login");
  }

  return (
    <div className="flex min-h-[calc(100vh-1.5rem)]">
      <OwnerSidebar role={ctx.role} ownerEmail={ctx.ownerEmail} ownerName={ctx.name} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-12 items-center justify-end gap-4 border-b border-habb-line bg-white px-6">
          <OwnerLogoutButton />
        </header>
        <main className="flex-1 px-6 py-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
