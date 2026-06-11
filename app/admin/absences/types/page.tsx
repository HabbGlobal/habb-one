import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { AbsenceTypesEditor, type AbsenceTypeRow } from "./AbsenceTypesEditor";
import type { AbsenceCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AbsenceTypesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Read-Berechtigung minimal — Schreiben + Anlegen + Archivieren erfordert
  // zusätzlich `absences.write` (Default: ADMIN + PLANNER). Ohne write-Recht
  // bekommt der User die Liste, aber keine Action-Buttons.
  if (!hasPermission(session.user.role, "absences.read")) {
    redirect("/admin");
  }
  const canWrite = hasPermission(session.user.role, "absences.write");

  const rows = await prisma.absenceType.findMany({
    where: { companyId: session.user.companyId, deletedAt: null },
    orderBy: [{ archivedAt: "asc" }, { labelDe: "asc" }],
  });

  const types: AbsenceTypeRow[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    labelDe: r.labelDe,
    labelEn: r.labelEn,
    category: r.category as AbsenceCategory,
    isPaid: r.isPaid,
    reducesTarget: r.reducesTarget,
    countsAsWorked: r.countsAsWorked,
    requiresApproval: r.requiresApproval,
    colorHex: r.colorHex,
    archivedAt: r.archivedAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/absences"
          className="inline-flex items-center gap-1 text-xs text-habb-muted hover:text-habb-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          Abwesenheiten
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-habb-ink">
          Abwesenheits-Typen
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-habb-muted">
          Definiere die Abwesenheits-Arten, die in deiner Firma erfasst werden
          können — z. B. Ferien, Krankheit, Weiterbildung, Militärdienst.
          Jeder Typ hat eine Bezeichnung, eine Farbe für den Plan, eine
          Kategorie für Reports und ein Verhalten (bezahlt? reduziert
          Soll-Stunden? braucht Genehmigung?).
          {!canWrite && (
            <span className="mt-2 block text-habb-warning">
              Du hast Lese-Berechtigung — Anlegen/Bearbeiten erfordert die
              Rolle {`„CEO"`} oder {`„Sekretariat"`} (Berechtigung
              <code className="mx-1 rounded bg-habb-paper px-1">absences.write</code>).
            </span>
          )}
        </p>
      </div>

      <AbsenceTypesEditor types={types} canWrite={canWrite} />
    </div>
  );
}
