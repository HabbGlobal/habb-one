"use server";

// Server-Actions der Kiosk-Actions-Seite.
//
// Sicherheits-Hintergrund: Wenn die Kiosk-Session NICHT explizit geklärt
// wird, kann ein Nachfolger im Werkstatt-Tablet via Browser-Forward/Back
// auf die Actions-Seite des vorigen Mitarbeiters zurück navigieren —
// die Session-Cookie ist 10 Min sliding gültig. Diese Action wird vom
// "Back"-Button aufgerufen und sorgt dafür, dass der Cookie SOFORT weg
// ist; in Kombination mit `Cache-Control: no-store` (Middleware) und
// einem clientseitigen `pageshow`-Listener (BackGuard) ist Replay nicht
// mehr möglich.

import { redirect } from "next/navigation";
import { clearKioskSession } from "@/lib/kiosk-session";

export async function endKioskSessionAction() {
  await clearKioskSession();
  redirect("/kiosk");
}
