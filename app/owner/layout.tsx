import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isOwnerPortalEnabled } from "@/lib/owner/feature-flag";
import { OwnerTopBanner } from "@/components/owner/TopBanner";

export const metadata: Metadata = {
  title: "habb.ch Owner Console",
  robots: { index: false, follow: false },
};

// Always dynamic — owner pages depend on cookies + DB lookups.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Outer Owner-Layout. Verantwortlich für:
 *   - Feature-Flag-Check (Portal aus → 404)
 *   - Top-Banner (immer sichtbar, visuelles "ich bin im Owner-Portal")
 *
 * KEIN Auth-Check hier — der gehört in das geschützte Route-Group-Layout
 * `(authed)/layout.tsx`, damit Login + Passkey-Enrollment frei zugänglich
 * bleiben.
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
