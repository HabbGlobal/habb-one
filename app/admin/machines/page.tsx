import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Cog } from "lucide-react";
import { MachineList } from "./MachineList";

export const dynamic = "force-dynamic";

export default async function MachinesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "machines.read")) redirect("/admin");

  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const canWrite = hasPermission(session.user.role, "machines.write");

  const [machines, areas] = await Promise.all([
    prisma.machine.findMany({
      where: {
        companyId: session.user.companyId,
        deletedAt: null,
        ...(showArchived ? {} : { archivedAt: null }),
      },
      include: { workArea: { select: { id: true, name: true, colorHex: true } } },
      orderBy: [{ isActive: "desc" }, { type: "asc" }, { name: "asc" }],
    }),
    prisma.workArea.findMany({
      where: {
        companyId: session.user.companyId,
        archivedAt: null,
        deletedAt: null,
      },
      select: { id: true, name: true, colorHex: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-habb-paper p-2 mt-1">
            <Cog className="h-6 w-6 text-habb-ink" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Machines</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Werkstatt-Anlagen + Zuordnung zu Bereichen für die automatische
              Personalplanung.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={showArchived ? "/admin/machines" : "/admin/machines?archived=1"}>
              {showArchived ? "Aktive zeigen" : "Archivierte zeigen"}
            </Link>
          </Button>
          {canWrite && (
            <Button asChild size="sm">
              <Link href="/admin/machines/new">
                <Plus className="h-4 w-4 mr-1" />
                Neue Maschine
              </Link>
            </Button>
          )}
        </div>
      </div>

      {areas.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ Es gibt noch keine{" "}
          <Link href="/admin/areas" className="underline font-medium">
            Werkstatt-Bereiche
          </Link>
          . Lege erst Bereiche an (Sandstrahlen, Pulvern, …), dann kannst du
          Maschinen darauf mappen.
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {machines.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Noch keine Maschinen erfasst.{" "}
              {canWrite && (
                <Link
                  href="/admin/machines/new"
                  className="text-habb-ink hover:text-habb-red font-medium underline"
                >
                  Erste anlegen →
                </Link>
              )}
            </div>
          ) : (
            <MachineList
              rows={machines.map((m) => ({
                id: m.id,
                name: m.name,
                type: m.type,
                isActive: m.isActive,
                archivedAt: m.archivedAt,
                workAreaId: m.workAreaId,
                workAreaName: m.workArea?.name ?? null,
                workAreaColor: m.workArea?.colorHex ?? null,
                maxDimensions: formatDimensions(m),
                chargeCapacityM2: m.chargeCapacityM2 ? Number(m.chargeCapacityM2) : null,
              }))}
              areas={areas}
              canWrite={canWrite}
            />
          )}
        </CardContent>
      </Card>

      {!showArchived && (
        <p className="text-xs text-muted-foreground">
          Tipp: Bereiche pro Maschine kannst du direkt in der Tabelle ändern —
          die Änderung wirkt sofort auf den Werkstatt → Personal-Plan-Ableiter.
        </p>
      )}
    </div>
  );
}

function formatDimensions(m: {
  maxLengthMm: number | null;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
}): string | null {
  const parts = [m.maxLengthMm, m.maxWidthMm, m.maxHeightMm];
  if (parts.every((p) => p == null)) return null;
  return parts.map((p) => (p == null ? "?" : `${p}`)).join(" × ") + " mm";
}
