"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { HabbWordmark } from "@/components/kiosk/HabbWordmark";

interface CompanyOption {
  id: string;
  name: string;
}

interface Props {
  appName: string;
  companyLabel: string;
  companies: CompanyOption[];
}

const PIN_DOT_COUNT = 4;
const MAX_PIN_LENGTH = 8;

export function KioskLockScreen({ appName, companyLabel, companies }: Props) {
  const router = useRouter();

  const [theme, setTheme] = useState<"light" | "dark">("light");
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
    setError(null);
    setPassword((current) =>
      current.length >= MAX_PIN_LENGTH ? current : `${current}${digit}`,
    );
  };

  const clearPin = () => {
    setError(null);
    setPassword("");
  };

  const removeLastDigit = () => {
    setError(null);
    setPassword((current) => current.slice(0, -1));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (companies.length > 1 && !companyId) {
      setError("Select a company.");
      return;
    }

    if (!password) {
      setError("PIN missing.");
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
          password,
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
      <div className={theme === "dark" ? "dark" : ""}>
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
      </div>
    );
  }

  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <main className="flex min-h-screen items-center justify-center bg-habb-paper p-6 text-habb-ink transition-colors dark:bg-neutral-950 dark:text-white">
        <div className="fixed right-5 top-5 z-10 flex rounded-lg border border-habb-line bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${theme === "light"
                ? "bg-habb-ink text-white"
                : "text-habb-muted hover:text-habb-ink dark:hover:text-white"
              }`}
          >
            Light
          </button>

          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${theme === "dark"
                ? "bg-white text-neutral-950"
                : "text-habb-muted hover:text-habb-ink dark:hover:text-white"
              }`}
          >
            Dark
          </button>
        </div>

        <form
          onSubmit={submit}
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

          <p className="mt-2 text-sm leading-relaxed text-habb-muted">
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

          <div className="mt-5 flex justify-center gap-3">
            {Array.from({ length: PIN_DOT_COUNT }).map((_, index) => (
              <span
                key={index}
                className={`h-2.5 w-2.5 rounded-full border transition-colors ${password.length > index
                    ? "border-habb-red bg-habb-red"
                    : "border-neutral-300 bg-transparent dark:border-neutral-700"
                  }`}
              />
            ))}
          </div>

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

          <button
            type="submit"
            disabled={pending}
            className="mt-4 w-full rounded-lg bg-habb-red px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-habb-red-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Checking…" : "Unlock tablet"}
          </button>

          <p className="mt-4 text-xs leading-relaxed text-habb-muted">
            Tablet stays unlocked until logged out at end of shift.
          </p>

          <div
            className={`mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium ${online ? "text-emerald-700" : "text-red-600"
              }`}
          >
            {online ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Network connected
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                Network offline
              </>
            )}
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-habb-muted">
            <span>Powered by</span>
            <HabbWordmark size="sm" />
          </div>
        </form>
      </main>
    </div>
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