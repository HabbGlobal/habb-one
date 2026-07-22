// JSON equivalent of the web "Back" button's server action
// (app/kiosk/[employeeId]/actions/actions.ts: endKioskSessionAction).
// Clears the kiosk_session cookie so the next tablet/app user cannot
// return to this employee's actions screen. The mobile client navigates
// back to the employee grid itself after calling this.

import { NextResponse } from "next/server";
import { clearKioskSession } from "@/lib/kiosk-session";

export async function DELETE() {
  await clearKioskSession();
  return NextResponse.json({ ok: true });
}
