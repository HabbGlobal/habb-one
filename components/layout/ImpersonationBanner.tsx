import { ShieldAlert } from "lucide-react";
import { getActiveImpersonation } from "@/lib/owner/impersonation";
import { EndImpersonationButton } from "./EndImpersonationButton";

/**
 * Persistent banner shown in the tenant app while a HABB Global (PVT) LTD
 * owner is signed in as a tenant user. This server component reads the
 * impersonation cookie on every request and disappears when the session ends
 * or expires.
 */
export async function ImpersonationBanner() {
  const imp = await getActiveImpersonation();
  if (!imp) return null;

  const minutesLeft = Math.max(
    0,
    Math.round((imp.expiresAt.getTime() - Date.now()) / 60_000),
  );
  const scopeLabel = imp.scope === "READONLY" ? "Read-only access" : "Full access";

  return (
    <div className="sticky top-0 z-40 bg-habb-red text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2 text-sm md:px-6">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="font-semibold">HABB Global (PVT) LTD Support</span>{" "}
          <span className="opacity-90">
            ({imp.ownerName}) is currently signed in as{" "}
            <span className="font-medium">{imp.targetUserName}</span> for tenant{" "}
            {imp.targetCompanyName}.
          </span>
          <span className="ml-2 hidden md:inline opacity-80">
            · {scopeLabel} · expires in {minutesLeft} min
          </span>
        </div>
        <EndImpersonationButton />
      </div>
    </div>
  );
}
