// Workshop scan page for QR capture on mobile.
//
// Flow:
//   1) Employee scans QR on the workshop job traveler with the camera.
//   2) Browser opens this page.
//   3) Page shows current step state + available actions
//      (Start / Pause / Resume / Complete).
//   4) Employee taps an action, enters employee number + PIN, confirms.
//   5) Server saves event, state update, auto-refresh fetches new state.
//
// Server component layer fetches initial state, client component allows
// interaction + polling.

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
