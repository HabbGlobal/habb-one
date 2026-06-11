"use client";

// Client-seitiger Anti-Replay-Schutz für die Kiosk-Actions-Seite.
//
// Browser haben einen "Back/Forward Cache" (bfcache), der Seiten
// vollständig (inkl. JS-State, ohne Server-Roundtrip) wiederherstellt.
// Das bedeutet: Wenn ein Mitarbeiter Pin-eingibt, auf der Actions-Seite
// landet und dann zurück navigiert, KANN der bfcache die Seite per
// Browser-Forward-Knopf wieder anzeigen — OHNE dass unsere Server-
// Auth-Prüfung (readKioskSession) erneut läuft.
//
// Verteidigung in 3 Schichten:
//   1. `Cache-Control: no-store` via Middleware → die meisten Browser
//      disqualifizieren die Seite damit komplett vom bfcache.
//   2. Server-Action im Zurück-Button löscht `kiosk_session` SOFORT.
//   3. Dieser Listener: erkennt bfcache-Restore und erzwingt einen
//      kompletten Reload — der Server prüft die (jetzt gelöschte)
//      Session und redirected zur PIN-Eingabe.
//
// Es würde reichen, eine der 3 Schichten zu haben — aber wir wollen
// auf Werkstatt-Tablets mit unbekannten Browsern absolut sicher sein.

import { useEffect } from "react";

export function BackGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      // `persisted` ist true, wenn die Seite aus dem bfcache kommt
      // (also ohne Server-Roundtrip wiederhergestellt wurde). Wir
      // erzwingen dann einen Full-Reload, damit der Server-Auth-Check
      // erneut läuft.
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
