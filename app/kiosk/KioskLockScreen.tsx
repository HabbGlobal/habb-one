"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { HabbWordmark } from "@/components/kiosk/HabbWordmark";
import { KioskThemeToggle } from "@/components/kiosk/KioskThemeToggle";

interface CompanyOption {
  id: string;
  name: string;
}

interface Props {
  appName: string;
  companyLabel: string;
  companies: CompanyOption[];
}

const PIN_LENGTH = 4;

export function KioskLockScreen({ appName, companyLabel, companies }: Props) {
  const router = useRouter();

  const [companyId, setCompanyId] = useState(
    companies.length === 1 ? companies[0].id : "",
  );
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const updateOnlineStatus = () => setOnline(navigator.onLine);

    updateOnlineStatus();

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  const appendDigit = (digit: string) => {
    if (pending || password.length >= PIN_LENGTH) return;
    setError(null);
    const next = `${password}${digit}`;
    setPassword(next);
    if (next.length === PIN_LENGTH) submit(next);
  };

  const clearPin = () => {
    if (pending) return;
    setError(null);
    setPassword("");
  };

  const removeLastDigit = () => {
    if (pending) return;
    setError(null);
    setPassword((current) => current.slice(0, -1));
  };

  const submit = async (value: string) => {
    setError(null);

    if (companies.length > 1 && !companyId) {
      setError("Select a company.");
      setPassword("");
      return;
    }

    setPending(true);
    let success = false;

    try {
      const response = await fetch("/api/kiosk/lock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyId,
          password: value,
        }),
      });

      if (response.ok) {
        success = true;
        setUnlocking(true);
        router.refresh();
        return;
      }

      const body = await response.json().catch(() => null);
      const code = body?.error ?? "ERROR";

      setError(translateError(code));
      setPassword("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      if (!success) {
        setPending(false);
      }
    }
  };

  if (unlocking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-habb-paper text-habb-ink dark:bg-neutral-950 dark:text-white p-6">
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="relative h-24 w-24">
            <div className="absolute inset-0 rounded-full border-4 border-neutral-200 dark:border-neutral-800"></div>
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-habb-red border-t-transparent"></div>
            <div className="absolute inset-2 animate-[spin_1.5s_linear_infinite_reverse] rounded-full border-4 border-neutral-400 dark:border-neutral-500 border-t-transparent opacity-50"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-3 w-3 animate-pulse rounded-full bg-habb-red"></div>
            </div>
          </div>
          <p className="animate-pulse text-lg font-semibold tracking-widest uppercase">
            Unlocking Kiosk
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-habb-paper p-6 text-habb-ink transition-colors dark:bg-neutral-950 dark:text-white">
      <KioskThemeToggle className="fixed right-5 top-5 z-10" />

      <div
          className="w-full max-w-[340px] rounded-xl border border-habb-line bg-white px-7 py-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <img
            src="/brand/habb-logo.png"
            alt="Habb Logo"
            className="mx-auto h-12 w-auto object-contain rounded-lg"
          />

          <h1 className="mt-2 text-xl font-bold tracking-tight text-habb-ink dark:text-white">
            Workshop Kiosk
          </h1>

          <p className="mt-2 text-sm leading-relaxed text-habb-muted dark:text-neutral-400">
            Enter the kiosk PIN to unlock this tablet.
          </p>

          <div className="mt-6 text-left">


            <select
              id="company"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
              disabled={companies.length === 1}
              required
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-habb-ink outline-none transition-colors focus:border-habb-red disabled:cursor-not-allowed disabled:bg-habb-paper dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:disabled:bg-neutral-800"
            >
              <option value="">— select —</option>

              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {pending ? (
            <div className="mt-5 flex justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-habb-red border-t-transparent" />
            </div>
          ) : (
            <div className="mt-5 flex justify-center gap-3">
              {Array.from({ length: PIN_LENGTH }).map((_, index) => (
                <span
                  key={index}
                  className={`h-2.5 w-2.5 rounded-full border transition-colors ${password.length > index
                      ? "border-habb-red bg-habb-red"
                      : "border-neutral-300 bg-transparent dark:border-neutral-700"
                    }`}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-habb-red dark:border-red-900/50 dark:bg-red-950/30">
              {error}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <PinKey
                key={digit}
                label={digit}
                disabled={pending}
                onClick={() => appendDigit(digit)}
              />
            ))}

            <PinKey label="Clear" action disabled={pending} onClick={clearPin} />
            <PinKey label="0" disabled={pending} onClick={() => appendDigit("0")} />
            <PinKey label="⌫" action disabled={pending} onClick={removeLastDigit} />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-habb-muted dark:text-neutral-400">
            Tablet stays unlocked until logged out at end of shift.
          </p>

          <div
            className={`mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium ${online ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
          >
            {online ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                Network connected
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400" />
                Network offline
              </>
            )}
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-habb-muted dark:text-neutral-400">
            <span>Powered by</span>
            <HabbWordmark size="sm" />
          </div>
        </div>
      </main>
  );
}

function PinKey({
  label,
  action = false,
  disabled,
  onClick,
}: {
  label: string;
  action?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        action
          ? "rounded-lg px-2 py-3 text-xs font-semibold text-habb-muted transition-colors hover:bg-habb-paper hover:text-habb-ink disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-neutral-800 dark:hover:text-white"
          : "rounded-lg border border-habb-line bg-habb-paper px-2 py-3 font-mono text-lg font-semibold text-habb-ink transition active:scale-95 active:border-habb-red active:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:active:bg-red-950/30"
      }
    >
      {label}
    </button>
  );
}

function translateError(code: string): string {
  switch (code) {
    case "WRONG_PASSWORD":
      return "Wrong PIN.";
    case "NO_PASSWORD_SET":
      return "No kiosk PIN is set for this company.";
    case "COMPANY_REQUIRED":
      return "Company must be selected.";
    case "NOT_FOUND":
      return "Company not found.";
    default:
      return "Login failed.";
  }
}