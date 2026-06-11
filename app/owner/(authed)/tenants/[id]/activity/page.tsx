import { Activity } from "lucide-react";

export default function TenantActivityStub() {
  return (
    <section className="rounded-lg border border-dashed border-habb-line bg-white px-5 py-10 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-habb-paper">
        <Activity className="h-5 w-5 text-habb-muted" />
      </span>
      <h2 className="mt-3 text-sm font-medium text-habb-ink">Aktivitäts-Übersicht</h2>
      <p className="mt-1 text-xs text-habb-muted">
        Login-Historie, API-Aufrufe und Heatmap folgen in einem späteren PR.
      </p>
    </section>
  );
}
