import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isOwnerPortalEnabled } from "@/lib/owner/feature-flag";
import { OwnerTopBanner } from "@/components/owner/TopBanner";

export const metadata: Metadata = {
  title: "HABB One Owner Console",
  robots: { index: false, follow: false },
};

// Always dynamic — owner pages depend on cookies + DB lookups.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Outer owner layout. Responsible for:
 *   - Feature-flag check (portal off -> 404)
 *   - Top banner (always visible, visual "I am in the owner portal" cue)
 *
 * No auth check here; that belongs in the protected route-group layout
 * `(authed)/layout.tsx`, so login and passkey enrollment remain freely
 * accessible.
 */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  if (!isOwnerPortalEnabled()) {
    notFound();
  }
  return (
    <div className="min-h-screen bg-habb-paper text-habb-ink">
      <OwnerTopBanner />
      {children}
    </div>
  );
}
