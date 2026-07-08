import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TemplateForm } from "../TemplateForm";
import { TemplateLifecycleActions } from "./TemplateLifecycleActions";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "templates.read")) redirect("/admin");

  const { id } = await params;
  const tpl = await prisma.processTemplate.findFirst({
    where: { id, companyId: session.user.companyId },
    include: { steps: { orderBy: { sequence: "asc" } } },
  });
  if (!tpl) notFound();

  const canWrite = hasPermission(session.user.role, "templates.write");

  const initial = {
    templateId: tpl.id,
    label: tpl.label,
    description: tpl.description ?? "",
    sortOrder: tpl.sortOrder,
    steps: tpl.steps.map((s) => ({
      sequence: s.sequence,
      processCode: s.processCode,
      machineTypeRequired: s.machineTypeRequired,
      skillRequired: s.skillRequired,
      defaultWaitMinutes: s.defaultWaitMinutes,
      notes: s.notes ?? "",
    })),
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {tpl.label}
            {tpl.key && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {tpl.key}
              </Badge>
            )}
            {tpl.archivedAt && <Badge variant="secondary">Archived</Badge>}
            {tpl.deletedAt && <Badge variant="destructive">Deleted</Badge>}
          </h1>
          {tpl.description && (
            <p className="text-sm text-muted-foreground mt-1">{tpl.description}</p>
          )}
        </div>
        {canWrite && (
          <TemplateLifecycleActions
            templateId={tpl.id}
            isArchived={tpl.archivedAt !== null}
            isDeleted={tpl.deletedAt !== null}
          />
        )}
      </div>

      {canWrite ? (
        <Card>
          <CardHeader>
<<<<<<< HEAD
            <CardTitle className="text-base">Edit Template</CardTitle>
=======
            <CardTitle className="text-base">Edit template</CardTitle>
>>>>>>> f0bfc268c2f2ece681b2305c28e6da1a442e79c6
          </CardHeader>
          <CardContent>
            <TemplateForm mode="edit" initial={initial} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Steps (read-only)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1 font-mono">
              {tpl.steps.map((s) => (
                <li key={s.id}>
                  {s.sequence}. {s.processCode} · {s.skillRequired}
                  {s.machineTypeRequired ? ` · ${s.machineTypeRequired}` : ""}
                  {s.defaultWaitMinutes > 0 && ` · ${s.defaultWaitMinutes} min wait time`}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
