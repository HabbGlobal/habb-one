"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function OwnerLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logout = async () => {
    setPending(true);
    try {
      await fetch("/api/owner/auth/logout", { method: "POST" });
      router.replace("/owner/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-xs text-habb-muted hover:text-habb-ink focus-visible:text-habb-ink focus-visible:outline-none disabled:opacity-50"
    >
      <LogOut className="h-3.5 w-3.5" />
      Abmelden
    </button>
  );
}
