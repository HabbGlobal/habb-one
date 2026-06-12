import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { CustomerForm, DEFAULT_CUSTOMER_FORM } from "../CustomerForm";

export default async function NewCustomerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "customers.write")) {
    redirect("/admin/customers");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Neuer Kunde</h1>
        <Link
          href="/admin/customers"
          className="text-sm text-muted-foreground hover:underline"
        >← Back</Link>
      </div>
      <CustomerForm initial={DEFAULT_CUSTOMER_FORM} mode={{ kind: "create" }} />
    </div>
  );
}
