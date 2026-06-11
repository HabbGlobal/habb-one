"use client";

// Mitarbeiter-Kachel auf der öffentlichen Kiosk-Übersicht.
//
// Zeigt einen Live-Counter ab der CLOCK_IN-Zeit, damit jeder im Werkstatt
// sieht: ja, die Zeit LÄUFT — auch wenn niemand auf der Actions-Seite
// eingeloggt ist. Server liefert die letzte CLOCK_IN-Zeit + den aktuellen
// Status; Client tickt jede Sekunde weiter.
//
// Datenschutz: Wir zeigen NUR öffentliche Information:
//   - Name (eh schon da)
//   - Status (eingestempelt / Pause / abwesend)
//   - "seit HH:MM" + Counter (kein Saldo, keine Sollstunden)

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Coffee, LogIn, LogOut, Plane } from "lucide-react";

export type KioskStatus = "IN" | "BREAK" | "OUT" | "ABSENT";

interface Props {
  employeeId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  status: KioskStatus;
  /** ISO-Datum der letzten CLOCK_IN- bzw. BREAK_START-Zeit. */
  sinceIso: string | null;
  /** "07:30"-Anzeige der Start-Zeit. */
  sinceLabel: string | null;
  /** Bei ABSENT: kurzes Label (z. B. "Ferien"). */
  absenceLabel: string | null;
  /** Bei OUT mit gestempelten Stunden: Anzeige "X.Yh heute" (kein Saldo). */
  todayWorkedLabel: string | null;
  serverNowIso: string;
}

export function KioskEmployeeTile({
  employeeId,
  firstName,
  lastName,
  employeeNumber,
  status,
  sinceIso,
  sinceLabel,
  absenceLabel,
  todayWorkedLabel,
  serverNowIso,
}: Props) {
  const [clientNow, setClientNow] = useState(Date.now());
  useEffect(() => {
    if (status !== "IN" && status !== "BREAK") return;
    const id = setInterval(() => setClientNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Live-Dauer berechnen ab Server-Start. Wir nutzen serverNowIso als
  // Referenz, damit Client/Server-Zeitversatz keine Rolle spielt.
  let liveCounter: string | null = null;
  if (sinceIso && (status === "IN" || status === "BREAK")) {
    const sinceMs = new Date(sinceIso).getTime();
    const serverNowMs = new Date(serverNowIso).getTime();
    const drift = clientNow - serverNowMs;
    const elapsedMs = Math.max(0, Date.now() - sinceMs - drift);
    liveCounter = formatHMS(elapsedMs);
  }

  const accent =
    status === "IN"
      ? "border-habb-success"
      : status === "BREAK"
        ? "border-habb-warning"
        : status === "ABSENT"
          ? "border-habb-red"
          : "border-habb-line";

  return (
    <Link href={`/kiosk/${employeeId}`} className="block">
      <Card
        className={`hover:shadow-md transition cursor-pointer h-full border-l-4 ${accent} border-habb-line shadow-sm`}
      >
        <CardContent className="p-5 space-y-3">
          {/* Name */}
          <div>
            <div className="text-2xl font-semibold leading-tight text-habb-ink">
              {firstName}
            </div>
            <div className="text-base text-habb-muted">
              {lastName}{" "}
              <span className="text-xs">#{employeeNumber}</span>
            </div>
          </div>

          {/* Status */}
          <div>
            {status === "IN" && (
              <div className="space-y-0.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-habb-success uppercase tracking-wider">
                  <span className="inline-block w-2 h-2 rounded-full bg-habb-success animate-pulse" />
                  Eingestempelt
                </div>
                {sinceLabel && (
                  <div className="text-xs text-habb-muted">
                    seit {sinceLabel}
                  </div>
                )}
                {liveCounter && (
                  <div className="text-2xl font-mono tabular-nums text-habb-success font-semibold">
                    {liveCounter}
                  </div>
                )}
              </div>
            )}
            {status === "BREAK" && (
              <div className="space-y-0.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-habb-warning uppercase tracking-wider">
                  <Coffee className="h-3 w-3" />
                  In Pause
                </div>
                {sinceLabel && (
                  <div className="text-xs text-habb-muted">
                    seit {sinceLabel}
                  </div>
                )}
                {liveCounter && (
                  <div className="text-2xl font-mono tabular-nums text-habb-warning font-semibold">
                    {liveCounter}
                  </div>
                )}
              </div>
            )}
            {status === "OUT" && (
              <div className="space-y-0.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-habb-muted uppercase tracking-wider">
                  <LogOut className="h-3 w-3" />
                  Ausgestempelt
                </div>
                {todayWorkedLabel && (
                  <div className="text-xs text-habb-muted">
                    Heute: {todayWorkedLabel}
                  </div>
                )}
                {!todayWorkedLabel && (
                  <div className="inline-flex items-center gap-1 text-xs text-habb-muted">
                    <LogIn className="h-3 w-3" />
                    Tippen zum Einstempeln
                  </div>
                )}
              </div>
            )}
            {status === "ABSENT" && (
              <div className="space-y-0.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-habb-red uppercase tracking-wider">
                  <Plane className="h-3 w-3" />
                  {absenceLabel ?? "Abwesend"}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatHMS(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
