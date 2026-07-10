"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function KioskLogoutButton({
  mode = "lock",
  theme = "light",
}: {
  mode?: "lock" | "account";
  theme?: "light" | "dark";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);

  const handleLogoutClick = () => {
    setShowConfirm(true);
  };

  const executeLogout = async () => {
    setShowConfirm(false);
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
    <>
      <button
        type="button"
        onClick={handleLogoutClick}
        disabled={pending}
        title={mode === "account" ? "Sign out" : "Lock tablet"}
        className={
          theme === "dark"
            ? "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex items-center gap-1.5 rounded-lg border border-habb-line bg-white px-3 py-2 text-sm font-medium text-habb-muted transition-colors hover:border-neutral-300 hover:text-habb-ink disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        <LogOut className="h-4 w-4" />
        {pending ? "Please wait…" : mode === "account" ? "Sign out" : "Lock tablet"}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-3xl border p-6 shadow-2xl ${theme === "dark" ? "bg-habb-black border-white/10 text-white" : "bg-white border-habb-line text-habb-ink"}`}>
            <h3 className="text-xl font-bold mb-2">
              {mode === "account" ? "Sign Out" : "Lock Tablet"}
            </h3>
            <p className={`text-sm mb-6 ${theme === "dark" ? "text-neutral-400" : "text-habb-muted"}`}>
              {mode === "account"
                ? "Sign out from this tablet? A new login will be required next time."
                : "Lock this tablet? The kiosk PIN will be required next time."}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                  theme === "dark" 
                    ? "bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5" 
                    : "bg-neutral-100 hover:bg-neutral-200 text-habb-ink"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeLogout}
                className="rounded-xl px-4 py-2 text-sm font-semibold transition-all bg-habb-red hover:bg-habb-red/90 text-white shadow-lg shadow-habb-red/20"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}