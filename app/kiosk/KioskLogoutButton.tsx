"use client";

// "Lock tablet / Sign out" at the end of a shift. Two modes:
//   - mode="lock"    → anonymous tablet: delete only the kiosk lock cookie;
//                      the tablet then displays the lock screen again.
//   - mode="account" → KIOSK_OPERATOR account signed in through NextAuth:
//                      call signOut() instead of deleting the lock cookie,
//                      then redirect the tablet to /login.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function KioskLogoutButton({ mode = "lock" }: { mode?: "lock" | "account" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handle = async () => {
    const prompt =
      mode === "account"
        ? "Sign out from this tablet? A new login will be required next time."
        : "Lock this tablet? The kiosk password will be required next time.";
    if (!confirm(prompt)) return;
    setPending(true);
    try {
      if (mode === "account") {
        await signOut({ redirect: false });
        router.push("/login");
        router.refresh();
      } else {
        await fetch("/api/kiosk/lock", { method: "DELETE" });
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      title={mode === "account" ? "Sign out (end of shift)" : "Lock tablet (end of shift)"}
    >
      <LogOut className="h-4 w-4" />
      {mode === "account" ? "Sign out" : "Lock tablet"}
    </button>
  );
}
