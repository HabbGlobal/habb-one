import { LifeBuoy } from "lucide-react";

export default function TenantSupportStub() {
  return (
    <section className="rounded-lg border border-dashed border-habb-line bg-white px-5 py-10 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-habb-paper">
        <LifeBuoy className="h-5 w-5 text-habb-muted" />
      </span>
      <h2 className="mt-3 text-sm font-medium text-habb-ink">Support tickets</h2>
      <p className="mt-1 text-xs text-habb-muted">
        Ticket history, pinned notes, and reply templates will follow in Phase v2.
      </p>
    </section>
  );
}
