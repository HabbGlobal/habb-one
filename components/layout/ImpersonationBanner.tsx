import { ShieldAlert } from "lucide-react";
import { getActiveImpersonation } from "@/lib/owner/impersonation";
import { EndImpersonationButton } from "./EndImpersonationButton";

/**
 * Persistenter Banner, der in der Tenant-App genau dann erscheint, wenn
 * ein habb.ch-Owner gerade als angemeldeter User unterwegs ist.
 * Server-Component — liest die Impersonation aus dem Cookie pro Request
 * und blendet sich aus, sobald die Sitzung beendet/abgelaufen ist.
 */
export async function ImpersonationBanner() {
  const imp = await getActiveImpersonation();
  if (!imp) return null;

  const minutesLeft = Math.max(
    0,
    Math.round((imp.expiresAt.getTime() - Date.now()) / 60_000),
  );
  const scopeLabel = imp.scope === "READONLY" ? "Nur Lesezugriff" : "Vollzugriff";

  return (
    <div className="sticky top-0 z-40 bg-habb-red text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2 text-sm md:px-6">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="font-semibold">habb.ch Support</span>{" "}
          <span className="opacity-90">
            ({imp.ownerName}) ist gerade als{" "}
            <span className="font-medium">{imp.targetUserName}</span> in deinem
            Mandanten {imp.targetCompanyName} angemeldet.
          </span>
          <span className="ml-2 hidden md:inline opacity-80">
            · {scopeLabel} · läuft in {minutesLeft} Min ab
          </span>
        </div>
        <EndImpersonationButton />
      </div>
    </div>
  );
}
