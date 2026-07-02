"use server";

// Server actions for the kiosk actions page.
//
// Security context: if the kiosk session is not explicitly cleared, the next
// tablet user could navigate back to the previous employee's actions page
// while the 10-minute sliding session cookie remains valid. The Back button
// calls this action to delete the cookie immediately. Combined with
// `Cache-Control: no-store` in middleware and the client-side `pageshow`
// listener in BackGuard, this prevents replay.

import { redirect } from "next/navigation";
import { clearKioskSession } from "@/lib/kiosk-session";

export async function endKioskSessionAction() {
  await clearKioskSession();
  redirect("/kiosk");
}
