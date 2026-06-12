"use client";

// Machine list with inline area editor.
//
// The `workArea` dropdown is DIRECTLY editable in the table — clicking
// the pill badge opens a dropdown, selection persists immediately.
// Other fields are edited in the detail form (`/admin/machines/[id]`).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Pencil, Archive, ArchiveRestore } from "lucide-react";
import {
  setMachineWorkArea,
  archiveMachine,
  unarchiveMachine,
} from "./actions";

const TYPE_LABEL: Record<string, string> = {
  BLAST_CABIN: "Sandstrahl-Kabine",
  CHEM_BATH: "Chemie-Bad",
  PAINT_CABIN: "Lackier-Kabine",
  POWDER_CABIN: "Pulver-Kabine",
  CURING_OVEN: "Aushärte-Ofen",
  DRYING_OVEN: "Trocken-Ofen",
};

interface MachineRow {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  archivedAt: Date | null;
  workAreaId: string | null;
  workAreaName: string | null;
  workAreaColor: string | null;
  maxDimensions: string | null;
  chargeCapacityM2: number | null;
}

interface AreaOption {
  id: string;
  name: string;
  colorHex: string;
}

interface Props {
  rows: MachineRow[];
  areas: AreaOption[];
  canWrite: boolean;
}

export function MachineList({ rows, areas, canWrite }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const onChangeArea = (machineId: string, value: string) => {
    setError(null);
    setSavingId(machineId);
    const newAreaId = value === "" ? null : value;
    start(async () => {
      try {
        await setMachineWorkArea(machineId, newAreaId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      } finally {
        setSavingId(null);
      }
    });
  };

  const toggleArchive = (machineId: string, isArchived: boolean) => {
    if (
      !confirm(
        isArchived
          ? "Reactivate machine?"
          : "Archive machine? It will no longer be bookable in the workshop plan.",
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        if (isArchived) await unarchiveMachine(machineId);
        else await archiveMachine(machineId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error.");
      }
    });
  };

  return (
    <div>
      {error && (
        <div className="mx-4 my-3 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Machine</TableHead>
            <TableHead>Typeeee</TableHead>
            <TableHead>Area</TableHead>
            <TableHead>Dimensions / Capacity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const isArchived = m.archivedAt != null;
            const isSavingThis = savingId === m.id;
            return (
              <TableRow key={m.id} className={isArchived ? "opacity-60" : ""}>
                <TableCell>
                  <Link
                    href={`/admin/machines/${m.id}`}
                    className="font-medium hover:underline"
                  >
                    {m.name}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {TYPE_LABEL[m.type] ?? m.type}
                </TableCell>
                <TableCell>
                  {canWrite && !isArchived ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={m.workAreaId ?? ""}
                        onChange={(e) => onChangeArea(m.id, e.target.value)}
                        disabled={pending}
                        className="w-44 h-8 text-sm"
                        aria-label="Area"
                      >
                        <option value="">— no area —</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                      {isSavingThis && (
                        <span className="text-xs text-muted-foreground">…</span>
                      )}
                    </div>
                  ) : m.workAreaName ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span
                        className="inline-block w-3 h-3 rounded-full border"
                        style={{
                          backgroundColor: m.workAreaColor ?? "#cbd5e1",
                        }}
                      />
                      {m.workAreaName}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      no area
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {m.maxDimensions && <div>{m.maxDimensions}</div>}
                  {m.chargeCapacityM2 != null && (
                    <div>Charge: {m.chargeCapacityM2.toFixed(1)} m²</div>
                  )}
                  {!m.maxDimensions && m.chargeCapacityM2 == null && (
                    <span className="italic">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {isArchived ? (
                    <Badge variant="secondary">Archived</Badge>
                  ) : m.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="warning">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    {canWrite && (
                      <Link
                        href={`/admin/machines/${m.id}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-habb-paper"
                        aria-label="Edit"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    )}
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => toggleArchive(m.id, isArchived)}
                        disabled={pending}
                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-habb-paper"
                        aria-label={isArchived ? "Reactivate" : "Archive"}
                        title={isArchived ? "Reactivate" : "Archive"}
                      >
                        {isArchived ? (
                          <ArchiveRestore className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Archive className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
