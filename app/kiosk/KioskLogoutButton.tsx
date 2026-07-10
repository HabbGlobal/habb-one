"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function KioskLogoutButton({
  mode = "lock",
}: {
  mode?: "lock" | "account";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    const message =
      mode === "account"
        ? "Sign out from this tablet? A new login will be required next time."
        : "Lock this tablet? The kiosk PIN will be required next time.";

    if (!confirm(message)) return;

    setPending(true);

    try {
      if (mode === "account") {
        await signOut({ redirect: false });
        router.push("/login");
        router.refresh();
      } else {
        await fetch("/api/kiosk/lock", {
          method: "DELETE",
        });

        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      title={mode === "account" ? "Sign out" : "Lock tablet"}
      className="inline-flex items-center gap-1.5 rounded-lg border border-habb-line bg-white px-3 py-2 text-sm font-medium text-habb-muted transition-colors hover:border-neutral-300 hover:text-habb-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
      {pending ? "Please wait…" : mode === "account" ? "Sign out" : "Lock tablet"}
    </button>
  );
}