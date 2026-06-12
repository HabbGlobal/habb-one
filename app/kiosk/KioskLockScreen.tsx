"use client";

// Lock screen: Kiosk iPad must be unlocked before the employee list
// becomes visible. Entered once per shift by the secretary/workshop
// manager.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { HabbWordmark } from "@/components/kiosk/HabbWordmark";

interface CompanyOption {
  id: string;
  name: string;
}

interface Props {
  appName: string;
  companyLabel: string;
  /** If only 1 company in the DB → empty; otherwise: selection options. */
  companies: CompanyOption[];
}

export function KioskLockScreen({ appName, companyLabel, companies }: Props) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(
    companies.length === 1 ? companies[0].id : "",
  );
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (companies.length > 1 && !companyId) {
      setError("Select a company.");
      return;
    }
    if (!password) {
      setError("Password missing.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/kiosk/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Always send the companyId — if only 1 company is visible,
          // it was already pre-filled in the useState initial.
          // This way the server doesn't have to guess which company is meant.
          companyId,
          password,
        }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const body = await res.json().catch(() => null);
        const code = body?.error ?? "ERROR";
        setError(translateError(code));
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-habb-paper flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-habb-red/10 ring-1 ring-habb-red/20">
            <Lock className="h-7 w-7 text-habb-red" />
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-habb-muted">
            {companyLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-habb-ink">
            {appName} — Workshop Kiosk
          </h1>
          <p className="text-sm text-habb-muted">
            Please enter the kiosk password to unlock the tablet.
          </p>
        </div>

        <Card className="mt-6 border-habb-line shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              {companies.length > 1 && (
                <div className="space-y-1">
                  <Label htmlFor="company">Company</Label>
                  <select
                    id="company"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-habb-line bg-white px-3 py-2 text-sm"
                    required
                  >
                    <option value="">— select —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="password">Kiosk password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••"
                  autoFocus
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-habb-black text-white hover:bg-habb-ink"
                disabled={pending}
              >
                {pending ? "Checking…" : "Unlock tablet"}
              </Button>

              <p className="text-center text-xs text-habb-muted">
                Tablet remains unlocked until logged out at end of shift.
              </p>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <a
            href="https://HABB Global (PVT) LTD"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-habb-muted hover:text-habb-ink"
          >
            Powered by <HabbWordmark size="sm" />
          </a>
        </div>
      </div>
    </main>
  );
}

function translateError(code: string): string {
  switch (code) {
    case "WRONG_PASSWORD":
      return "Wrong password.";
    case "NO_PASSWORD_SET":
      return "No kiosk password is set for this company.";
    case "COMPANY_REQUIRED":
      return "Company must be selected.";
    case "NOT_FOUND":
      return "Company not found.";
    default:
      return "Login failed.";
  }
}
