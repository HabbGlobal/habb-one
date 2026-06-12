"use client";

// "Tablet sperren / Abmelden" am Schichtende. Zwei Modi:
//   - mode="lock"    → anonymes Tablet: nur Kiosk-Lock-Cookie löschen,
//                      Tablet zeigt danach wieder den Lock-Screen.
//   - mode="account" → KIOSK_OPERATOR-Konto via NextAuth eingeloggt:
//                      signOut() statt Lock-Cookie. Tablet landet auf /login.

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
        ? "Vom Tablet abmelden? Beim nächsten Zugriff ist eine neue Anmeldung nötig."
        : "Tablet sperren? Beim nächsten Zugriff wird das Kiosk-Passwort wieder verlangt.";
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
      title={mode === "account" ? "Abmelden (Schicht-Ende)" : "Tablet sperren (Schicht-Ende)"}
    >
      <LogOut className="h-4 w-4" />
      {mode === "account" ? "Sign out" : "Suspend"}
    </button>
  );
}
