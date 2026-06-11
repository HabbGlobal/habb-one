import Link from "next/link";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import { LifecycleTabs } from "@/components/admin/LifecycleTabs";
import {
  lifecycleFilter,
  parseView,
  type LifecycleView,
} from "@/lib/lifecycle";
import { processLabel } from "@/lib/order/labels";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "templates.read")) redirect("/admin");

  const sp = await searchParams;
  const view: LifecycleView = parseView(sp.view);

  const baseWhere: Prisma.ProcessTemplateWhereInput = {
    companyId: session.user.companyId,
  };
  const filterWhere: Prisma.ProcessTemplateWhereInput = {
    ...baseWhere,
    ...lifecycleFilter(view),
  };

  const [templates, active, archived, deleted] = await Promise.all([
    prisma.processTemplate.findMany({
      where: filterWhere,
      include: { steps: { orderBy: { sequence: "asc" } } },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.processTemplate.count({
      where: { ...baseWhere, ...lifecycleFilter("active") },
    }),
    prisma.processTemplate.count({
      where: { ...baseWhere, ...lifecycleFilter("archived") },
    }),
    prisma.processTemplate.count({
      where: { ...baseWhere, ...lifecycleFilter("deleted") },
    }),
  ]);

  const counts = { active, archived, deleted };
  const canWrite = hasPermission(session.user.role, "templates.write");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Process-Vorlagen</h1>
          <p className="text-sm text-muted-foreground">
            Standard-Workflows für Aufträge und Offerten. Änderungen wirken
            sofort auf neue Aufträge / Offerten — bestehende bleiben unverändert.
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/admin/templates/new">Neue Vorlage</Link>
          </Button>
        )}
      </div>

      <LifecycleTabs baseHref="/admin/templates" current={view} counts={counts} />

      {templates.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            Keine Vorlagen in dieser Ansicht.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="hover:shadow-sm transition">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/admin/templates/${t.id}`}
                      className="font-semibold hover:underline"
                    >
                      {t.label}
                    </Link>
                    {t.key && (
                      <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                        {t.key}
                      </span>
                    )}
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/admin/templates/${t.id}`}
                    className="inline-flex items-center justify-center h-8 w-8 rounded hover:bg-accent transition shrink-0"
                    aria-label="Bearbeiten"
                    title="Bearbeiten"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.steps.map((s) => (
                    <Badge
                      key={s.id}
                      variant="secondary"
                      className="text-[10px] font-normal"
                    >
                      {s.sequence}. {processLabel(s.processCode)}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
