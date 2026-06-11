import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateForm } from "../TemplateForm";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "templates.write")) redirect("/admin/templates");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Neue Process-Vorlage</h1>
        <p className="text-sm text-muted-foreground">
          Definiere die Standard-Schrittfolge. Wird sofort in Auftrags-/Offerten-Wizard verfügbar.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vorlagen-Daten</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
