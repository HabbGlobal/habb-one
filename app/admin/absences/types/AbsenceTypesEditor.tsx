"use client";

// Table of absence types + actions (New / Edit / Archive).
// Read-only for users WITHOUT `absences.write` (then the editor is rendered
// with disabled=true and only the list is shown).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { AbsenceTypeForm, type AbsenceTypeFormValues } from "./AbsenceTypeForm";
import { archiveAbsenceType, restoreAbsenceType } from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  VACATION: "Vacation",
  SICKNESS: "Sickness",
  ACCIDENT: "Accident",
  MILITARY: "Military Service",
  DOCTOR: "Doctor Visit",
  UNPAID: "Unpaid",
  COMPENSATION: "Compensation",
  OTHER: "Other",
};

export interface AbsenceTypeRow {
  id: string;
  key: string;
  labelDe: string;
  labelEn: string;
  category: keyof typeof CATEGORY_LABELS;
  isPaid: boolean;
  reducesTarget: boolean;
  countsAsWorked: boolean;
  requiresApproval: boolean;
  colorHex: string;
  archivedAt: string | null;
}

interface Props {
  types: AbsenceTypeRow[];
  canWrite: boolean;
}

export function AbsenceTypesEditor({ types, canWrite }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AbsenceTypeFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (t: AbsenceTypeRow) => {
    setEditing({
      id: t.id,
      key: t.key,
      labelDe: t.labelDe,
      labelEn: t.labelEn,
      category: t.category,
      isPaid: t.isPaid,
      reducesTarget: t.reducesTarget,
      countsAsWorked: t.countsAsWorked,
      requiresApproval: t.requiresApproval,
      colorHex: t.colorHex,
    });
    setDialogOpen(true);
  };

  const archive = (t: AbsenceTypeRow) => {
    if (
      !confirm(
        `Archive type "${t.labelDe}"? Existing absences remain, but new ones can no longer use this type.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        await archiveAbsenceType(t.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Archive failed.");
      }
    });
  };

  const restore = (t: AbsenceTypeRow) => {
    setError(null);
    start(async () => {
      try {
        await restoreAbsenceType(t.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reactivation failed.");
      }
    });
  };

  const active = types.filter((t) => !t.archivedAt);
  const archived = types.filter((t) => t.archivedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-habb-muted">
          {active.length} active type{active.length === 1 ? "" : "s"}
          {archived.length > 0 && ` · ${archived.length} archived`}
        </p>
        {canWrite && (
          <Button onClick={openNew} size="sm">
            <Plus className="mr-1 h-4 w-4" /> New Type</Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-habb-line bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-center">Paid</TableHead>
              <TableHead className="text-center">Reduces Target</TableHead>
              <TableHead className="text-center">Approval?</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-habb-muted">
                  No absence types yet.
                  {canWrite && ` Click "New Type" to get started.`}
                </TableCell>
              </TableRow>
            )}
            {types.map((t) => (
              <TableRow
                key={t.id}
                className={t.archivedAt ? "bg-habb-paper/40 text-habb-muted" : ""}
              >
                <TableCell>
                  <span
                    className="inline-block h-4 w-4 rounded-sm border border-habb-line"
                    style={{ backgroundColor: t.colorHex }}
                    title={t.colorHex}
                  />
                </TableCell>
                <TableCell className="font-medium text-habb-ink">
                  <span className={t.archivedAt ? "line-through" : ""}>{t.labelDe}</span>
                  <span className="ml-2 text-xs text-habb-muted">{t.labelEn}</span>
                  {t.archivedAt && (
                    <Badge variant="secondary" className="ml-2">
                      archived
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{t.key}</TableCell>
                <TableCell>
                  <Badge variant="outline">{CATEGORY_LABELS[t.category]}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  {t.isPaid ? "✓" : "—"}
                </TableCell>
                <TableCell className="text-center">
                  {t.reducesTarget ? "✓" : "—"}
                </TableCell>
                <TableCell className="text-center">
                  {t.requiresApproval ? "✓" : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && (
                    <div className="inline-flex items-center gap-1">
                      {!t.archivedAt && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(t)}
                            disabled={pending}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => archive(t)}
                            disabled={pending}
                            title="Archive"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {t.archivedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => restore(t)}
                          disabled={pending}
                          title="Reactivate"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canWrite && (
        <AbsenceTypeForm
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
        />
      )}
    </div>
  );
}
