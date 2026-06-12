import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MachineForm } from "../MachineForm";

const TYPE_LABEL: Record<string, string> = {
  BLAST_CABIN: "Sandstrahl-Kabine",
  CHEM_BATH: "Chemie-Bad",
  PAINT_CABIN: "Lackier-Kabine",
  POWDER_CABIN: "Pulver-Kabine",
  CURING_OVEN: "Aushärte-Ofen",
  DRYING_OVEN: "Trocken-Ofen",
};

export default async function EditMachinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "machines.read")) redirect("/admin");

  const { id } = await params;

  const [machine, areas] = await Promise.all([
    prisma.machine.findFirst({
      where: { id, companyId: session.user.companyId, deletedAt: null },
    }),
    prisma.workArea.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
      },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!machine) notFound();

  const canWrite = hasPermission(session.user.role, "machines.write");

  return (
    <div className="space-y-4 max-w-4xl">
      <Link
        href="/admin/machines"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Zurück zur Liste
      </Link>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{machine.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {TYPE_LABEL[machine.type] ?? machine.type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {machine.archivedAt ? (
            <Badge variant="secondary">Archiviert</Badge>
          ) : machine.isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="warning">Inactive</Badge>
          )}
        </div>
      </div>

      {!canWrite && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Du hast keine Schreib-Berechtigung — Felder sind read-only.
        </div>
      )}

      <fieldset disabled={!canWrite || machine.archivedAt != null}>
        <MachineForm
          initial={{
            name: machine.name,
            type: machine.type,
            workAreaId: machine.workAreaId,
            maxLengthMm: machine.maxLengthMm,
            maxWidthMm: machine.maxWidthMm,
            maxHeightMm: machine.maxHeightMm,
            maxWeightKg: machine.maxWeightKg,
            chargeCapacityM2: machine.chargeCapacityM2
              ? Number(machine.chargeCapacityM2)
              : null,
            isActive: machine.isActive,
          }}
          areas={areas}
          mode={{ kind: "edit", id: machine.id }}
        />
      </fieldset>
    </div>
  );
}
