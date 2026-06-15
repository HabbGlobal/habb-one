import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission } from "@/lib/permissions";
import { AreaForm } from "../AreaForm";

export default async function NewAreaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "settings.write")) redirect("/admin/areas");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Area</h1>
        <Link href="/admin/areas" className="text-sm text-muted-foreground hover:underline">← Back</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New Area</CardTitle>
        </CardHeader>
        <CardContent>
          <AreaForm
            mode={{ kind: "create" }}
            initial={{
              name: "",
              description: "",
              colorHex: "#6366f1",
              sortOrder: 99,
              minEmployeesPerDay: null,
              maxEmployeesPerDay: null,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
