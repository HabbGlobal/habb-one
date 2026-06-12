import { CreditCard } from "lucide-react";

export default function TenantBillingStub() {
  return (
    <section className="rounded-lg border border-dashed border-habb-line bg-white px-5 py-10 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-habb-paper">
        <CreditCard className="h-5 w-5 text-habb-muted" />
      </span>
      <h2 className="mt-3 text-sm font-medium text-habb-ink">Billing</h2>
      <p className="mt-1 text-xs text-habb-muted">
        Stripe integration and open invoices — Phase v2. The{" "}
        <strong>plan change</strong> (modules follow automatically) can be found in the
        tab <strong>Modules</strong>.
      </p>
    </section>
  );
}
