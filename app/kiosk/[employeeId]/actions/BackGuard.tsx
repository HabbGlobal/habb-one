"use client";

// Client-side replay protection for the kiosk actions page.
//
// Browsers have a back/forward cache (bfcache) that can restore an entire page,
// including JavaScript state, without a server round trip. After an employee
// enters a PIN and leaves the actions page, browser forward navigation could
// restore it without running readKioskSession again.
//
// Three layers of protection:
//   1. `Cache-Control: no-store` from middleware prevents most browsers from
//      placing the page in bfcache.
//   2. The server action behind the Back button immediately deletes
//      `kiosk_session`.
//   3. This listener detects a bfcache restore and forces a full reload. The
//      server then checks the deleted session and redirects to PIN entry.
//
// The layered approach protects workshop tablets running unknown browsers.

import { useEffect } from "react";

export function BackGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      // `persisted` is true when the page was restored from bfcache without a
      // server round trip. Force a full reload so server authentication runs.
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
