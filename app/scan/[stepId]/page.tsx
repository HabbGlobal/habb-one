// Werkstatt-Scan-Page für QR-Erfassung am Handy.
//
// Flow:
//   1) Mitarbeiter scant QR auf Werkstatt-Laufzettel mit der Kamera.
//   2) Browser öffnet diese Seite.
//   3) Seite zeigt aktuellen Schritt-State + verfügbare Aktionen
//      (Starten / Pausieren / Fortsetzen / Beenden).
//   4) Mitarbeiter tippt Aktion an, gibt EmployeeNr. + PIN ein, bestätigt.
//   5) Server speichert Event, State-Update, Auto-Refresh holt neuen Stand.
//
// Server-Component-Layer holt initialen State, Client-Component erlaubt
// Interaktion + Polling.

import { notFound } from "next/navigation";
import { getStepStatus } from "./actions";
import { ScanClient } from "./ScanClient";

export const dynamic = "force-dynamic";

export default async function ScanStepPage({
  params,
}: {
  params: Promise<{ stepId: string }>;
}) {
  const { stepId } = await params;

  let initial: Awaited<ReturnType<typeof getStepStatus>>;
  try {
    initial = await getStepStatus(stepId);
  } catch {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-4 md:py-6 max-w-md mx-auto">
      <ScanClient stepId={stepId} initial={initial} />
    </div>
  );
}
